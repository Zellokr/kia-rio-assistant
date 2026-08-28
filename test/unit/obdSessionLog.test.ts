import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  ObdSessionLog
} from '../../core/obd/logging/ObdSessionLog'

function createClock(...values: number[]) {
  let index = 0

  return () => {
    const value = values[index]

    index++

    if (value === undefined) {
      throw new Error('Clock exhausted')
    }

    return value
  }
}

describe('ObdSessionLog', () => {
  it('records ordered events with deterministic session metadata', () => {
    const log = new ObdSessionLog({
      transport: {
        kind: 'mock',
        name: 'Mock ELM327'
      },
      now: createClock(1_000, 1_025, 1_050),
      idFactory: () => 'session-1'
    })

    log.record({
      type: 'tx',
      direction: 'tx',
      commandId: 'command-1',
      command: '010C',
      rawText: '010C\r',
      normalizedText: '010C'
    })

    log.record({
      type: 'rx-chunk',
      direction: 'rx',
      commandId: 'command-1',
      command: '010C',
      rawText: '41 0'
    })

    const exported = log.getExport()

    expect(exported).toEqual({
      schemaVersion: 1,
      sessionId: 'session-1',
      startedAt: new Date(1_000).toISOString(),
      endedAt: null,
      transport: {
        kind: 'mock',
        name: 'Mock ELM327'
      },
      retention: {
        maxEvents: 50_000,
        droppedEvents: 0,
        complete: true
      },
      events: [
        expect.objectContaining({
          sequence: 1,
          timestamp: new Date(1_025).toISOString(),
          elapsedMs: 25,
          type: 'tx'
        }),
        expect.objectContaining({
          sequence: 2,
          timestamp: new Date(1_050).toISOString(),
          elapsedMs: 50,
          type: 'rx-chunk'
        })
      ]
    })

    expect(() => JSON.stringify(exported)).not.toThrow()
  })

  it('enforces retention and reports an incomplete export', () => {
    const log = new ObdSessionLog({
      transport: { kind: 'mock' },
      maxEvents: 2,
      now: createClock(0, 1, 2, 3),
      idFactory: () => 'retained-session'
    })

    for (const state of ['connecting', 'ready', 'disconnected'] as const) {
      log.record({
        type: 'session-state',
        state
      })
    }

    const exported = log.getExport()

    expect(exported.events.map(event => event.sequence)).toEqual([2, 3])
    expect(exported.retention).toEqual({
      maxEvents: 2,
      droppedEvents: 1,
      complete: false
    })
  })

  it('keeps chronological export order and retention metadata after multiple wraparounds', () => {
    const log = new ObdSessionLog({
      transport: { kind: 'mock' },
      maxEvents: 3,
      now: createClock(0, 1, 2, 3, 4, 5, 6, 7, 8),
      idFactory: () => 'wrapped-session'
    })

    for (const activity of [
      'adapter-selected',
      'connected',
      'initialization-started',
      'initialization-completed',
      'discovery-started',
      'discovery-completed',
      'queue-test-started',
      'queue-test-completed'
    ] as const) {
      log.record({
        type: 'activity',
        activity
      })
    }

    const exported = log.getExport()

    expect(exported.events.map(event => event.sequence)).toEqual([6, 7, 8])
    expect(exported.events.map(event => event.elapsedMs)).toEqual([6, 7, 8])
    expect(exported.events.map(event => (
      event.type === 'activity' ? event.activity : undefined
    ))).toEqual([
      'discovery-completed',
      'queue-test-started',
      'queue-test-completed'
    ])
    expect(exported.retention).toEqual({
      maxEvents: 3,
      droppedEvents: 5,
      complete: false
    })
  })

  it('finishes a session and starts a fresh one', () => {
    const log = new ObdSessionLog({
      transport: { kind: 'mock' },
      now: createClock(100, 110, 120, 200),
      idFactory: vi.fn()
        .mockReturnValueOnce('session-1')
        .mockReturnValueOnce('session-2')
    })

    log.record({
      type: 'session-state',
      state: 'ready'
    })

    log.finish()

    expect(log.getExport().endedAt).toBe(
      new Date(120).toISOString()
    )

    log.start({
      kind: 'mock',
      name: 'New adapter'
    })

    expect(log.getExport()).toMatchObject({
      sessionId: 'session-2',
      startedAt: new Date(200).toISOString(),
      endedAt: null,
      transport: {
        kind: 'mock',
        name: 'New adapter'
      },
      events: []
    })
  })

  it('isolates subscribers from the recording flow', () => {
    const log = new ObdSessionLog({
      transport: { kind: 'mock' },
      now: createClock(0, 1),
      idFactory: () => 'session-1'
    })

    const healthyListener = vi.fn()

    log.subscribe(() => {
      throw new Error('Broken UI listener')
    })
    log.subscribe(healthyListener)

    expect(() => {
      log.record({
        type: 'telemetry-state',
        state: 'started'
      })
    }).not.toThrow()

    expect(healthyListener).toHaveBeenCalledOnce()
    expect(log.getExport().events).toHaveLength(1)
  })

  it('returns defensive export copies', () => {
    const log = new ObdSessionLog({
      transport: { kind: 'mock' },
      now: createClock(0, 1),
      idFactory: () => 'session-1'
    })

    log.record({
      type: 'capability-discovery',
      pids: ['04', '05']
    })

    const first = log.getExport()

    first.events.splice(0)
    first.transport.name = 'Changed'

    const second = log.getExport()

    expect(second.events).toHaveLength(1)
    expect(second.transport.name).toBeUndefined()
  })

  it('detaches nested input values before storing them', () => {
    const log = new ObdSessionLog({
      transport: { kind: 'mock' },
      now: createClock(0, 1, 2, 3),
      idFactory: () => 'session-1'
    })
    const pids = ['04', '05']
    const decoded = {
      kind: 'dtc' as const,
      dtcs: ['P0300']
    }
    const error = {
      name: 'Error',
      message: 'Original error',
      phase: 'decode' as const
    }

    log.record({
      type: 'capability-discovery',
      pids
    })
    log.record({
      type: 'decoded-value',
      source: 'manual',
      command: '03',
      latencyMs: 2,
      decoded
    })
    log.record({
      type: 'error',
      error
    })

    pids.push('0C')
    decoded.dtcs.push('P0420')
    error.message = 'Mutated error'

    const events = log.getExport().events

    expect(events[0]).toMatchObject({
      type: 'capability-discovery',
      pids: ['04', '05']
    })
    expect(events[1]).toMatchObject({
      type: 'decoded-value',
      decoded: {
        kind: 'dtc',
        dtcs: ['P0300']
      }
    })
    expect(events[2]).toMatchObject({
      type: 'error',
      error: {
        message: 'Original error'
      }
    })
  })

  it('defines DTC payloads as observations so each log event retains state and type', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../core/obd/logging/ObdSessionLog.ts', import.meta.url)),
      'utf8'
    )

    expect(source).toMatch(/kind:\s*'dtc'[\s\S]*observations:\s*DtcObservation\[\]/)
  })

  it('defensively detaches DTC observations after recording them', () => {
    const log = new ObdSessionLog({
      transport: { kind: 'mock' },
      now: createClock(0, 1),
      idFactory: () => 'session-1'
    })
    const observations = [{
      code: 'P0300',
      system: 'P' as const,
      type: 'generic' as const,
      state: 'stored' as const,
      observedAt: '2026-08-26T19:00:00.000Z'
    }]

    log.record({
      type: 'decoded-value',
      source: 'manual',
      command: '03',
      latencyMs: 1,
      decoded: { kind: 'dtc', observations }
    } as unknown as Parameters<typeof log.record>[0])
    observations[0]!.state = 'permanent'

    expect(log.getExport().events[0]).toMatchObject({
      type: 'decoded-value',
      decoded: {
        kind: 'dtc',
        observations: [{
          code: 'P0300',
          type: 'generic',
          state: 'stored'
        }]
      }
    })
  })

  it('ignores events after the session is finished', () => {
    const log = new ObdSessionLog({
      transport: { kind: 'mock' },
      now: createClock(0, 10),
      idFactory: () => 'session-1'
    })
    const listener = vi.fn()

    log.subscribe(listener)
    log.finish()

    const result = log.record({
      type: 'session-state',
      state: 'disconnected'
    })

    expect(result).toBeUndefined()
    expect(log.getExport()).toMatchObject({
      endedAt: new Date(10).toISOString(),
      events: []
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith({
      type: 'finished',
      endedAt: new Date(10).toISOString()
    })
  })
})
