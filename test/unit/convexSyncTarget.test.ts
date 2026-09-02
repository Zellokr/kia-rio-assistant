import { describe, expect, it, vi } from 'vitest'

import {
  InMemoryObdPersistenceAdapter
} from '../../core/obd/persistence/InMemoryObdPersistenceAdapter'
import type { SyncOperation } from '../../core/sync/ports'
import {
  createConvexSyncTarget
} from '../../app/services/convexSyncTarget'

/**
 * The adapter that finally gives `drainSyncQueue` somewhere to push.
 *
 * The queue holds references, not snapshots, so this is where a reference
 * becomes a row: the target reads the record at push time and sends what the
 * store says then. That is also why a row that has since disappeared — a
 * session evicted by the twenty-session cap, a maintenance record the owner
 * deleted — is reported dropped rather than accepted. Nothing reached Convex,
 * and saying otherwise would claim a sync that never happened.
 */

function operation(
  id: string,
  overrides: Partial<SyncOperation> = {}
): SyncOperation {
  return {
    schemaVersion: 1,
    id,
    kind: 'session',
    recordId: id,
    enqueuedAt: '2026-09-02T10:00:00.000Z',
    attempts: 0,
    ...overrides
  }
}

async function storeWithSession(sessionId: string) {
  const persistence = new InMemoryObdPersistenceAdapter()

  await persistence.startSession({
    schemaVersion: 1,
    sessionId,
    startedAt: '2026-09-02T09:00:00.000Z',
    endedAt: '2026-09-02T09:30:00.000Z',
    transport: { kind: 'android-ble' } as never,
    reconnectCount: 2,
    truncated: false
  })

  return persistence
}

async function storeWithMaintenance(id: string) {
  const persistence = new InMemoryObdPersistenceAdapter()

  await persistence.saveMaintenanceRecord({
    schemaVersion: 1,
    id,
    performedAt: '2026-08-14',
    odometerKm: 92_400,
    item: 'Cambio de aceite y filtro',
    notes: null,
    interval: { km: 15_000, months: 12 }
  })

  return persistence
}

/** Answers the way the deployed mutation does: the localIds it committed. */
function mutation() {
  return vi.fn().mockImplementation((args: Record<string, unknown>) => {
    const rows = (args.sessions ?? args.records) as { localId: string }[]

    return Promise.resolve(rows.map(row => row.localId))
  })
}

function targetWith(persistence: never, call: ReturnType<typeof mutation>) {
  return createConvexSyncTarget({
    persistence,
    pushSessions: call,
    pushMaintenance: call
  })
}

describe('createConvexSyncTarget', () => {
  it('sends the session row as the store holds it now', async () => {
    const persistence = await storeWithSession('s1')
    const call = mutation()
    const target = targetWith(persistence as never, call)

    const result = await target.push([
      operation('session:s1', { recordId: 's1' })
    ])

    expect(result.acceptedIds).toEqual(['session:s1'])

    const [args] = call.mock.calls[0]!

    expect(args.sessions).toEqual([{
      schemaVersion: 1,
      localId: 's1',
      startedAt: '2026-09-02T09:00:00.000Z',
      endedAt: '2026-09-02T09:30:00.000Z',
      transportKind: 'android-ble',
      reconnectCount: 2,
      truncated: false
    }])
  })

  it('sends a maintenance record with the interval the owner stated', async () => {
    const persistence = await storeWithMaintenance('m1')
    const call = mutation()
    const target = targetWith(persistence as never, call)

    const result = await target.push([
      operation('maintenance:m1', { kind: 'maintenance', recordId: 'm1' })
    ])

    expect(result.acceptedIds).toEqual(['maintenance:m1'])

    const [args] = call.mock.calls[0]!

    expect(args.records).toEqual([{
      schemaVersion: 1,
      localId: 'm1',
      performedAt: '2026-08-14',
      odometerKm: 92_400,
      item: 'Cambio de aceite y filtro',
      notes: null,
      interval: { km: 15_000, months: 12 }
    }])
  })

  it('drops an operation whose row is gone instead of calling it accepted', async () => {
    const persistence = new InMemoryObdPersistenceAdapter()
    const call = mutation()
    const target = targetWith(persistence as never, call)

    const result = await target.push([operation('vanished')])

    expect(result.acceptedIds).toEqual([])
    expect(result.droppedIds).toEqual(['vanished'])
    // Nothing to send means nothing is sent.
    expect(call).not.toHaveBeenCalled()
  })

  it('groups the two kinds into one call each', async () => {
    const persistence = await storeWithSession('s1')

    await persistence.saveMaintenanceRecord({
      schemaVersion: 1,
      id: 'm1',
      performedAt: '2026-08-14',
      odometerKm: 92_400,
      item: 'Frenos',
      notes: null,
      interval: null
    })

    const call = mutation()
    const target = targetWith(persistence as never, call)

    const result = await target.push([
      operation('session:s1', { recordId: 's1' }),
      operation('maintenance:m1', { kind: 'maintenance', recordId: 'm1' })
    ])

    expect(call).toHaveBeenCalledTimes(2)
    expect(result.acceptedIds.sort()).toEqual(['maintenance:m1', 'session:s1'])
  })

  it('lets a failing mutation reach the drain rather than swallowing it', async () => {
    const persistence = await storeWithSession('s1')
    const call = vi.fn().mockRejectedValue(new Error('Convex no disponible'))
    const target = targetWith(persistence as never, call)

    await expect(target.push([operation('s1')])).rejects.toThrow('Convex no disponible')
  })

  it('accepts only the ids Convex actually returned', async () => {
    const persistence = await storeWithSession('s1')
    // A backend that committed nothing must not have its silence read as yes.
    const call = vi.fn().mockResolvedValue([])
    const target = targetWith(persistence as never, call)

    const result = await target.push([
      operation('session:s1', { recordId: 's1' })
    ])

    expect(result.acceptedIds).toEqual([])
  })
})
