import { describe, expect, it } from 'vitest'

import { buildReplayTranscript } from '../../core/obd/transport/ReplayObdTransport'
import realSession from '../fixtures/kiaRio2026-08-24Session.json'

/**
 * A real capture from the Kia Rio YB 2019 1.2 MPI, parked with the engine
 * idling, over the VEEPEAK BLE transport on 2026-08-24.
 *
 * Every other replay fixture in this suite is synthetic. This one is evidence:
 * it is the exported session log, byte for byte, and it exists so the pipeline
 * can be exercised against what a real ECU and a real adapter actually send —
 * including the multi-chunk BLE framing that synthetic fixtures tend to omit.
 *
 * Do not "tidy" the frames. Their exact shape is the point.
 */
describe('Kia Rio real vehicle session', () => {
  it('is a valid schema-v1 replay transcript', () => {
    expect(() => buildReplayTranscript(realSession)).not.toThrow()
  })

  it('was captured over the Android BLE transport', () => {
    expect(realSession.transport).toEqual({
      kind: 'android-ble',
      name: 'VEEPEAK'
    })
  })

  it('retained every event, so the evidence is complete', () => {
    expect(realSession.retention.droppedEvents).toBe(0)
    expect(realSession.retention.complete).toBe(true)
    expect(realSession.events).toHaveLength(91)
  })

  it('reached the ready state, proving the vehicle answered', () => {
    const states = realSession.events
      .filter(event => event.type === 'session-state')
      .map(event => event.state)

    expect(states).toEqual([
      'selecting',
      'selected',
      'connecting',
      'initializing',
      'discovering',
      'ready'
    ])
  })

  it('negotiated the protocol and decoded the capability bitmask', () => {
    const frame = realSession.events.find(
      event => event.type === 'rx-frame' && event.command === '0100'
    )

    // The adapter emits SEARCHING... while ATSP0 probes the bus; the parser
    // must strip it and keep only the real response.
    expect(frame?.rawText).toContain('SEARCHING...')
    expect(frame?.normalizedText).toBe('4100BE3EB813')
  })

  it('reassembled responses that arrived as several BLE notifications', () => {
    const chunks = realSession.events.filter(
      event => event.type === 'rx-chunk' && event.commandId === 'command-9'
    )
    const frame = realSession.events.find(
      event => event.type === 'rx-frame' && event.commandId === 'command-9'
    )

    expect(chunks.map(chunk => chunk.rawText)).toEqual(['410C0C4C\r', '\r>'])
    expect(frame?.normalizedText).toBe('410C0C4C')
  })

  it('decoded live engine values, fractional rpm included', () => {
    const decoded = realSession.events
      .filter(event => event.type === 'decoded-value')
      .map(event => [event.decoded.key, event.decoded.value])

    // 410C0C06 -> ((0x0C * 256) + 0x06) / 4 = 769.5. The OBD formula divides by
    // four, so a fractional rpm is correct and must not be "fixed" by rounding.
    expect(decoded).toContainEqual(['engineRpm', 769.5])
    expect(decoded).toContainEqual(['engineRpm', 787])
    // 410571 -> 0x71 - 40 = 73
    expect(decoded).toContainEqual(['coolantTemperature', 73])
  })

  /**
   * Captured before the capability-probe range was widened, so it preserves the
   * moment discovery hit the old allowlist wall. Kept deliberately: it is why
   * `0120` through `01C0` were later approved.
   */
  it('records the historical 0120 rejection that motivated widening the allowlist', () => {
    const rejection = realSession.events.find(
      event => event.type === 'error' && event.command === '0120'
    )

    expect(rejection?.error.name).toBe('PhysicalCommandRejectedError')

    const range = realSession.events.find(
      event => event.type === 'capability-discovery' && event.command === '0100'
    )

    expect(range?.hasNextRange).toBe(true)
    expect(range?.pids).toHaveLength(18)
  })
})
