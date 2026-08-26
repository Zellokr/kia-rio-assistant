import { describe, expect, it } from 'vitest'

import { upgradeDtcObservation } from '../../core/obd/persistence/upgradeDtcObservation'

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
