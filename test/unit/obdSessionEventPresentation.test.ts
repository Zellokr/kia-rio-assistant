import { describe, expect, it } from 'vitest'

import {
  filterSessionEvents,
  presentSessionEvent
} from '../../app/utils/obdSessionEventPresentation'
import type {
  ObdSessionEvent
} from '../../core/obd/logging/ObdSessionLog'

function event(
  value: Omit<ObdSessionEvent, 'sequence' | 'timestamp' | 'elapsedMs'>
): ObdSessionEvent {
  return {
    ...value,
    sequence: 1,
    timestamp: '2026-08-10T20:00:00.000Z',
    elapsedMs: 182
  } as ObdSessionEvent
}

describe('OBD session event presentation', () => {
  it('summarizes a response without hiding its raw evidence', () => {
    const item = presentSessionEvent(event({
      type: 'rx-frame',
      direction: 'rx',
      commandId: 'cmd-1',
      command: '010C',
      rawText: '41 0C 1A F8\r>',
      normalizedText: '41 0C 1A F8',
      responseKind: 'obd-data',
      latencyMs: 182
    }))

    expect(item.title).toBe('Respuesta · 010C')
    expect(item.summary).toBe('41 0C 1A F8')
    expect(item.meta).toContain('182 ms')
    expect(item.rawText).toBe('41 0C 1A F8\r>')
    expect(item.tone).toBe('success')
  })

  it('gives errors a clear recovery-oriented summary', () => {
    const item = presentSessionEvent(event({
      type: 'error',
      command: '0100',
      error: {
        name: 'TimeoutError',
        message: 'Timed out waiting for prompt',
        phase: 'timeout'
      }
    }))

    expect(item.title).toBe('Error · Tiempo de espera')
    expect(item.summary).toBe('Timed out waiting for prompt')
    expect(item.tone).toBe('error')
  })

  it('presents each decoded DTC with its persisted state and type', () => {
    const item = presentSessionEvent(event({
      type: 'decoded-value',
      source: 'manual',
      command: '03',
      latencyMs: 182,
      decoded: {
        kind: 'dtc',
        observations: [{
          code: 'P0300',
          system: 'P',
          type: 'generic',
          state: 'stored',
          observedAt: '2026-08-26T19:00:00.000Z'
        }]
      }
    } as unknown as Omit<ObdSessionEvent, 'sequence' | 'timestamp' | 'elapsedMs'>))

    expect(item.summary).toContain('P0300')
    expect(item.summary).toContain('stored')
    expect(item.summary).toContain('generic')
  })

  it('filters commands and errors without changing event order', () => {
    const events = [
      event({ type: 'session-state', state: 'connecting' }),
      event({
        type: 'tx',
        direction: 'tx',
        commandId: 'cmd-1',
        command: 'ATZ',
        rawText: 'ATZ\r',
        normalizedText: 'ATZ'
      }),
      event({
        type: 'error',
        error: {
          name: 'Error',
          message: 'Disconnected',
          phase: 'disconnect'
        }
      })
    ]

    expect(filterSessionEvents(events, 'commands')).toHaveLength(1)
    expect(filterSessionEvents(events, 'errors')).toEqual([events[2]])
    expect(filterSessionEvents(events, 'all')).toEqual(events)
  })
})
