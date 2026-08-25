import { describe, expect, it } from 'vitest'
import {
  InMemoryObdPersistenceAdapter
} from '../../core/obd/persistence/InMemoryObdPersistenceAdapter'
import { isPersistableEvent } from '../../core/obd/persistence/persistedEventAllowlist'
import type { PersistedObdSessionRecord } from '../../core/obd/persistence/ports'
import type { ObdSessionEvent } from '../../core/obd/logging/ObdSessionLog'

const envelope = {
  sequence: 1,
  timestamp: '2026-08-25T20:00:00.000Z',
  elapsedMs: 0
}
function session(id: string): PersistedObdSessionRecord {
  return {
    schemaVersion: 1,
    sessionId: id,
    startedAt: `2026-08-25T20:00:${id.padStart(2, '0')}.000Z`,
    endedAt: null,
    transport: { kind: 'mock' },
    reconnectCount: 0
  }
}
function event(value: Omit<ObdSessionEvent, keyof typeof envelope>): ObdSessionEvent {
  return { ...envelope, ...value } as ObdSessionEvent
}
describe('in-memory OBD persistence adapter', () => {
  it('keeps versioned sessions and events after reopening the adapter', async () => {
    const adapter = new InMemoryObdPersistenceAdapter()
    await adapter.startSession(session('one'))
    await adapter.appendEvents([{ schemaVersion: 1, sessionId: 'one', event: event({ type: 'session-state', state: 'ready' }) }])
    expect(await adapter.loadSession('one')).toEqual({
      session: session('one'),
      events: [{ schemaVersion: 1, sessionId: 'one', event: event({ type: 'session-state', state: 'ready' }) }]
    })
  })

  it('evicts only the oldest session and its events after session twenty-one', async () => {
    const adapter = new InMemoryObdPersistenceAdapter()
    for (let index = 1; index <= 21; index++) {
      const id = String(index)
      await adapter.startSession(session(id))
      await adapter.appendEvents([{ schemaVersion: 1, sessionId: id, event: event({ type: 'activity', activity: 'connected' }) }])
    }
    expect(await adapter.listSessions()).toHaveLength(20)
    expect(await adapter.loadSession('1')).toBeUndefined()
    expect((await adapter.loadSession('21'))?.events).toHaveLength(1)
  })

  it('allows only bounded, non-raw session events', async () => {
    const adapter = new InMemoryObdPersistenceAdapter()
    const events = [event({ type: 'session-state', state: 'ready' }), event({ type: 'decoded-value', source: 'manual', command: '010C', latencyMs: 1, decoded: { kind: 'pid', pid: '0C', key: 'rpm', label: 'RPM', value: 1, unit: 'rpm' } }), ...(['rx-chunk', 'tx', 'command-queued', 'rx-frame'] as const).map(type => event({ type } as never)), event({ type: 'decoded-value', source: 'telemetry', command: '010C', latencyMs: 1, decoded: { kind: 'pid', pid: '0C', key: 'rpm', label: 'RPM', value: 1, unit: 'rpm' } })]
    for (const value of events) expect(isPersistableEvent(value)).toBe(value !== events.at(-1) && !['rx-chunk', 'tx', 'command-queued', 'rx-frame'].includes(value.type))
    await adapter.startSession(session('one'))
    await adapter.appendEvents(events.map(event => ({ schemaVersion: 1 as const, sessionId: 'one', event })))
    expect((await adapter.loadSession('one'))?.events.map(record => record.event)).toEqual(events.slice(0, 2))
  })

  it('retains DTC observations until explicit deletion without adding other entities', async () => {
    const adapter = new InMemoryObdPersistenceAdapter()
    await adapter.recordObservations([{ schemaVersion: 1, id: 'dtc-1', sessionId: 'one', code: 'P0300', observedAt: '2026-08-25T20:00:00.000Z' }])
    expect(await adapter.listObservations()).toHaveLength(1)
    expect(Object.keys(adapter)).toEqual(['sessions', 'events', 'observations', 'caches'])
    await adapter.deleteObservation('dtc-1')
    expect(await adapter.listObservations()).toEqual([])
  })
})
