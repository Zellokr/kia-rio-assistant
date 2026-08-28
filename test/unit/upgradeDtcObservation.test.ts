import { describe, expect, it } from 'vitest'

import { isPersistedDtcObservationRecord, upgradeDtcObservation } from '../../core/obd/persistence/upgradeDtcObservation'

describe('upgradeDtcObservation', () => {
  it('upgrades a persisted Mode 03 v1 observation with its derived type and stored state', () => {
    expect(upgradeDtcObservation({
      schemaVersion: 1,
      id: 'legacy-p0300',
      sessionId: 'session-1',
      code: 'P0300',
      observedAt: '2026-08-26T19:00:00.000Z'
    })).toEqual({
      schemaVersion: 2,
      id: 'legacy-p0300',
      sessionId: 'session-1',
      code: 'P0300',
      type: 'generic',
      state: 'stored',
      observedAt: '2026-08-26T19:00:00.000Z'
    })
  })

  it('preserves an already-v2 observation without changing its pending state or manufacturer type', () => {
    const v2 = {
      schemaVersion: 2 as const,
      id: 'pending-c1234',
      sessionId: 'session-2',
      code: 'C1234',
      type: 'manufacturer' as const,
      state: 'pending' as const,
      observedAt: '2026-08-26T19:01:00.000Z'
    }

    expect(upgradeDtcObservation(v2)).toBe(v2)
  })
})

/**
 * `listObservations` used to cast whatever IndexedDB returned into the record
 * union. These are the rows that cast was wrong about.
 */
describe('isPersistedDtcObservationRecord', () => {
  const v2 = {
    schemaVersion: 2,
    id: 'one',
    sessionId: 's1',
    code: 'P0300',
    type: 'generic',
    state: 'stored',
    observedAt: '2026-08-25T20:00:00.000Z'
  }

  it('accepts the two schema versions this build can read', () => {
    expect(isPersistedDtcObservationRecord(v2)).toBe(true)
    expect(isPersistedDtcObservationRecord({
      schemaVersion: 1,
      id: 'one',
      sessionId: 's1',
      code: 'P0300',
      observedAt: '2026-08-25T20:00:00.000Z'
    })).toBe(true)
  })

  /**
   * The row the cast was most dangerous about. A future schema is not a v1
   * row, and treating it as one stamps `state: 'stored'` onto a fault code
   * whose real state nobody here knows.
   */
  it('rejects a row from a schema this build does not know', () => {
    expect(isPersistedDtcObservationRecord({ ...v2, schemaVersion: 3 }))
      .toBe(false)
  })

  it('rejects a row missing the code that parsing depends on', () => {
    const { code: _code, ...withoutCode } = v2

    expect(isPersistedDtcObservationRecord(withoutCode)).toBe(false)
  })

  it('rejects a v2 row missing the state it claims to carry', () => {
    const { state: _state, ...withoutState } = v2

    expect(isPersistedDtcObservationRecord(withoutState)).toBe(false)
  })

  it.each([null, undefined, 'P0300', 42, []])(
    'rejects %p, which is not a record at all',
    (value) => {
      expect(isPersistedDtcObservationRecord(value)).toBe(false)
    }
  )
})
