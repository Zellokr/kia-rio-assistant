import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import {
  InMemoryObdPersistenceAdapter
} from '../../core/obd/persistence/InMemoryObdPersistenceAdapter'
import { drainSyncQueue } from '../../core/sync/drainSyncQueue'
import type { SyncOperation, SyncTarget } from '../../core/sync/ports'
import { IndexedDbAdapter } from '../../data/indexeddb/IndexedDbAdapter'

/**
 * RF-035's local half: the queue, with no Convex behind it.
 *
 * §5 requires sessions and maintenance to reach Convex *"mediante una cola
 * tolerante a fallos"*, §6 makes IndexedDB the mandatory home for that queue,
 * and §15.2 adds the constraint that decides most of this design: the app
 * *"conserva operaciones offline y reintenta sin duplicar datos"*. T-011 is
 * the acceptance test — with Convex unavailable, *"la operación queda en cola
 * sin perder datos"*.
 *
 * There is no Convex adapter here and there cannot be one yet: no instance is
 * deployed (ADR-014). What is testable without one is everything that
 * matters — that nothing is lost when the remote fails, that a retry does not
 * duplicate, and that only what the remote durably accepted leaves the queue.
 * The `SyncTarget` port is the seam a Convex client will implement, and per
 * R-09 the OBD core never learns it exists.
 */

function operation(id: string, overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    schemaVersion: 1,
    id,
    kind: 'session',
    recordId: `record-${id}`,
    enqueuedAt: `2026-09-01T22:00:${id.padStart(2, '0')}.000Z`,
    attempts: 0,
    ...overrides
  }
}

function target(
  push: SyncTarget['push']
): SyncTarget & { push: ReturnType<typeof vi.fn> } {
  return { push: vi.fn(push) } as never
}

const adapters = [
  {
    name: 'in-memory',
    create: () => new InMemoryObdPersistenceAdapter()
  },
  {
    name: 'IndexedDB (fake-indexeddb)',
    create: () => new IndexedDbAdapter(new IDBFactory())
  }
] as const

describe.each(adapters)('$name sync queue storage', ({ create }) => {
  it('keeps enqueued operations in the order they were enqueued', async () => {
    const queue = create()

    await queue.enqueue(operation('2'))
    await queue.enqueue(operation('1'))

    expect((await queue.listPendingOperations()).map(item => item.id))
      .toEqual(['1', '2'])
  })

  it('does not duplicate an operation enqueued twice under the same id', async () => {
    const queue = create()

    await queue.enqueue(operation('1'))
    await queue.enqueue(operation('1', { recordId: 'record-1-corrected' }))

    const pending = await queue.listPendingOperations()

    expect(pending).toHaveLength(1)
    expect(pending[0]?.recordId).toBe('record-1-corrected')
  })

  it('removes only the operations the remote durably accepted', async () => {
    const queue = create()

    await queue.enqueue(operation('1'))
    await queue.enqueue(operation('2'))
    await queue.enqueue(operation('3'))

    await queue.markOperationsSynced(['1', '3'])

    expect((await queue.listPendingOperations()).map(item => item.id))
      .toEqual(['2'])
  })

  it('counts an attempt against an operation without discarding it', async () => {
    const queue = create()

    await queue.enqueue(operation('1'))
    await queue.recordOperationFailure(['1'])
    await queue.recordOperationFailure(['1'])

    const pending = await queue.listPendingOperations()

    expect(pending).toHaveLength(1)
    expect(pending[0]?.attempts).toBe(2)
  })

  it('ignores acknowledgements for operations it does not hold', async () => {
    const queue = create()

    await queue.enqueue(operation('1'))
    await queue.markOperationsSynced(['unknown'])
    await queue.recordOperationFailure(['unknown'])

    expect((await queue.listPendingOperations()).map(item => item.id))
      .toEqual(['1'])
  })
})

describe('drainSyncQueue', () => {
  it('clears the queue when the remote accepts everything', async () => {
    const queue = new InMemoryObdPersistenceAdapter()
    await queue.enqueue(operation('1'))
    await queue.enqueue(operation('2'))

    const remote = target(async operations => ({
      acceptedIds: operations.map(item => item.id)
    }))

    const report = await drainSyncQueue({ queue, target: remote })

    expect(report).toEqual({ outcome: 'drained', pushed: 2, accepted: 2 })
    expect(await queue.listPendingOperations()).toEqual([])
  })

  // T-011: Convex unavailable.
  it('loses nothing when the remote is unavailable', async () => {
    const queue = new InMemoryObdPersistenceAdapter()
    await queue.enqueue(operation('1'))
    await queue.enqueue(operation('2'))

    const remote = target(async () => {
      throw new Error('Convex no disponible')
    })

    const report = await drainSyncQueue({ queue, target: remote })

    expect(report).toEqual({
      outcome: 'failed',
      pushed: 2,
      accepted: 0,
      message: 'Convex no disponible'
    })

    const pending = await queue.listPendingOperations()

    expect(pending.map(item => item.id)).toEqual(['1', '2'])
    expect(pending.every(item => item.attempts === 1)).toBe(true)
  })

  it('keeps what a partial acceptance left behind', async () => {
    const queue = new InMemoryObdPersistenceAdapter()
    await queue.enqueue(operation('1'))
    await queue.enqueue(operation('2'))

    const remote = target(async () => ({ acceptedIds: ['1'] }))

    const report = await drainSyncQueue({ queue, target: remote })

    expect(report).toEqual({ outcome: 'drained', pushed: 2, accepted: 1 })

    const pending = await queue.listPendingOperations()

    expect(pending.map(item => item.id)).toEqual(['2'])
    // The unaccepted one carries an attempt, so a queue that never drains is
    // visible instead of silently spinning.
    expect(pending[0]?.attempts).toBe(1)
  })

  it('does not resend what a previous drain already delivered', async () => {
    const queue = new InMemoryObdPersistenceAdapter()
    await queue.enqueue(operation('1'))
    await queue.enqueue(operation('2'))

    const seen: string[][] = []
    const remote = target(async (operations) => {
      seen.push(operations.map(item => item.id))

      return { acceptedIds: operations.map(item => item.id).slice(0, 1) }
    })

    await drainSyncQueue({ queue, target: remote })
    await drainSyncQueue({ queue, target: remote })

    expect(seen).toEqual([['1', '2'], ['2']])
    expect(await queue.listPendingOperations()).toEqual([])
  })

  it('ignores an acknowledgement for an operation it never sent', async () => {
    const queue = new InMemoryObdPersistenceAdapter()
    for (const id of ['1', '2', '3']) {
      await queue.enqueue(operation(id))
    }

    // Only 1 and 2 are pushed, and the remote claims 3 as well. A remote that
    // acknowledges what it was never sent is confused, and acting on it would
    // delete an operation nobody delivered.
    const remote = target(async () => ({ acceptedIds: ['1', '3'] }))

    const report = await drainSyncQueue({ queue, target: remote, batchSize: 2 })

    expect(report).toEqual({ outcome: 'drained', pushed: 2, accepted: 1 })
    expect((await queue.listPendingOperations()).map(item => item.id))
      .toEqual(['2', '3'])
  })

  it('never calls the remote for an empty queue', async () => {
    const queue = new InMemoryObdPersistenceAdapter()
    const remote = target(async () => ({ acceptedIds: [] }))

    const report = await drainSyncQueue({ queue, target: remote })

    expect(report).toEqual({ outcome: 'empty', pushed: 0, accepted: 0 })
    expect(remote.push).not.toHaveBeenCalled()
  })

  it('pushes at most one batch per drain', async () => {
    const queue = new InMemoryObdPersistenceAdapter()
    for (let index = 1; index <= 5; index++) {
      await queue.enqueue(operation(String(index)))
    }

    const remote = target(async operations => ({
      acceptedIds: operations.map(item => item.id)
    }))

    const report = await drainSyncQueue({ queue, target: remote, batchSize: 2 })

    expect(remote.push).toHaveBeenCalledTimes(1)
    expect(report).toEqual({ outcome: 'drained', pushed: 2, accepted: 2 })
    expect((await queue.listPendingOperations()).map(item => item.id))
      .toEqual(['3', '4', '5'])
  })
})
