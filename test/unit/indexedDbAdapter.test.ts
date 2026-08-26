import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ObdSessionEvent } from '../../core/obd/logging/ObdSessionLog'
import type { PersistedObdSessionRecord } from '../../core/obd/persistence/ports'
import { IndexedDbAdapter } from '../../data/indexeddb/IndexedDbAdapter'
import { openObdDatabase } from '../../data/indexeddb/migrations'
import { OBD_STORES } from '../../data/indexeddb/stores'

// This file imports fake-indexeddb's IDBFactory CLASS directly and never
// touches globalThis.indexedDB. Each test gets its own IDBFactory instance,
// so nothing here leaks into other test files or between tests in this file.

const envelope = {
  sequence: 1,
  timestamp: '2026-08-25T20:00:00.000Z',
  elapsedMs: 0
}

function session(id: string, startedAt: string): PersistedObdSessionRecord {
  return {
    schemaVersion: 1,
    sessionId: id,
    startedAt,
    endedAt: null,
    transport: { kind: 'mock' },
    reconnectCount: 0,
    truncated: false
  }
}

function event(value: Omit<ObdSessionEvent, keyof typeof envelope>): ObdSessionEvent {
  return { ...envelope, ...value } as ObdSessionEvent
}

function startedAt(index: number): string {
  return `2026-08-25T20:00:${String(index).padStart(2, '0')}.000Z`
}

describe('IndexedDbAdapter (against fake-indexeddb, NOT the Android WebView — this is polyfill coverage, not device validation)', () => {
  let factory: IDBFactory

  beforeEach(() => {
    factory = new IDBFactory()
  })

  it('creates all four object stores with the keyPaths and indexes declared in stores.ts on migration v1', async () => {
    const database = await openObdDatabase(factory)

    expect([...database.objectStoreNames].sort()).toEqual(
      [OBD_STORES.sessions, OBD_STORES.events, OBD_STORES.observations, OBD_STORES.pidCache].sort()
    )

    const transaction = database.transaction([...database.objectStoreNames])

    const sessions = transaction.objectStore(OBD_STORES.sessions)
    expect(sessions.keyPath).toBe('sessionId')
    expect([...sessions.indexNames]).toEqual(['startedAt'])

    const events = transaction.objectStore(OBD_STORES.events)
    expect(events.keyPath).toBe('id')
    expect(events.autoIncrement).toBe(true)
    expect([...events.indexNames].sort()).toEqual(['sessionId', 'sessionIdSequence'])
    expect(events.index('sessionIdSequence').keyPath).toEqual(['sessionId', 'event.sequence'])

    const observations = transaction.objectStore(OBD_STORES.observations)
    expect(observations.keyPath).toBe('id')
    expect([...observations.indexNames].sort()).toEqual(['code', 'observedAt', 'sessionId'])

    const pidCache = transaction.objectStore(OBD_STORES.pidCache)
    expect(pidCache.keyPath).toBe('fingerprint')
    expect([...pidCache.indexNames]).toEqual([])

    database.close()
  })

  it('round-trips startSession -> appendEvents -> loadSession/listSessions with schemaVersion: 1 intact', async () => {
    const adapter = new IndexedDbAdapter(factory)
    const record = session('one', startedAt(1))
    const persistedEvent = {
      schemaVersion: 1 as const,
      sessionId: 'one',
      event: event({ type: 'session-state', state: 'ready' })
    }

    await adapter.startSession(record)
    await adapter.appendEvents([persistedEvent])

    expect(await adapter.listSessions()).toEqual([record])
    // The events store's keyPath ("id") is auto-incrementing, so a round-tripped
    // record carries the store-assigned "id" in addition to the written fields.
    expect(await adapter.loadSession('one')).toEqual({
      session: record,
      events: [{ ...persistedEvent, id: 1 }]
    })
  })

  it('keeps exactly twenty sessions when only twenty exist — no premature eviction at the boundary', async () => {
    const adapter = new IndexedDbAdapter(factory)
    for (let index = 1; index <= 20; index++) {
      await adapter.startSession(session(String(index), startedAt(index)))
    }

    const remaining = await adapter.listSessions()
    expect(remaining).toHaveLength(20)
    expect(remaining.map(item => item.sessionId)).toContain('1')
  })

  it('evicts exactly the oldest session at the twenty-first insert, cascade-deleting its events while a survivor keeps its own', async () => {
    const adapter = new IndexedDbAdapter(factory)
    for (let index = 1; index <= 21; index++) {
      const id = String(index)
      await adapter.startSession(session(id, startedAt(index)))
      await adapter.appendEvents([{
        schemaVersion: 1,
        sessionId: id,
        event: event({ type: 'activity', activity: 'connected' })
      }])
    }

    const remaining = await adapter.listSessions()
    expect(remaining).toHaveLength(20)
    expect(remaining.map(item => item.sessionId)).not.toContain('1')

    expect(await adapter.loadSession('1')).toBeUndefined()
    expect((await adapter.loadSession('21'))?.events).toHaveLength(1)
  })

  it('does not evict DTC observations when sessions roll off', async () => {
    const adapter = new IndexedDbAdapter(factory)
    const observation = {
      schemaVersion: 1 as const,
      id: 'dtc-1',
      sessionId: '1',
      code: 'P0300',
      observedAt: '2026-08-25T20:00:00.000Z'
    }
    await adapter.recordObservations([observation])

    for (let index = 1; index <= 21; index++) {
      await adapter.startSession(session(String(index), startedAt(index)))
    }

    expect(await adapter.listObservations()).toEqual([{
      ...observation,
      schemaVersion: 2,
      type: 'generic',
      state: 'stored'
    }])
  })

  it('normalizes a v1 IndexedDB observation to the v2 read model without opening a new database version', async () => {
    const legacy = {
      schemaVersion: 1,
      id: 'legacy-p0300',
      sessionId: 'legacy-session',
      code: 'P0300',
      observedAt: '2026-08-26T19:00:00.000Z'
    }
    const database = await openObdDatabase(factory)
    const transaction = database.transaction(OBD_STORES.observations, 'readwrite')
    transaction.objectStore(OBD_STORES.observations).put(legacy)
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = transaction.onabort = () => reject(transaction.error)
    })
    database.close()

    const adapter = new IndexedDbAdapter(factory)

    expect(await adapter.listObservations()).toEqual([{
      ...legacy,
      schemaVersion: 2,
      type: 'generic',
      state: 'stored'
    }])
  })

  it('round-trips the supported-PID cache by fingerprint', async () => {
    const adapter = new IndexedDbAdapter(factory)
    const cache = { schemaVersion: 1 as const, fingerprint: '0100:BE3FA813', pids: ['0C', '0D'] }

    await adapter.write(cache)

    expect(await adapter.read('0100:BE3FA813')).toEqual(cache)
    expect(await adapter.read('missing-fingerprint')).toBeUndefined()
  })
})
