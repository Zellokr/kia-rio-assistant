import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import type {
  DiagnosticAssessment
} from '../../core/obd/diagnostics/assessDiagnostics'
import { maintenanceSyncOperation } from '../../core/sync/maintenanceSyncOperation'
import { sessionSyncOperation } from '../../core/sync/sessionSyncOperation'
import {
  watchAssessmentPersistence
} from '../../app/composables/useAssessmentPersistence'

/**
 * Storing the evaluation the driver was shown, and queuing the session that
 * produced it.
 *
 * Both stores shipped before anything wrote to them. These are the two
 * producers: `watchAssessmentPersistence` decides *when* an evaluation is
 * worth a row, and `sessionSyncOperation` decides what a session's queue
 * entry looks like. Both are pure, so neither needs Nuxt to be proven.
 */

function assessment(
  overrides: Partial<DiagnosticAssessment> = {}
): DiagnosticAssessment {
  return {
    severity: 'warning',
    confidence: 'medium',
    dtcs: ['P0133'],
    evidence: [{ type: 'dtc', description: 'Sonda lambda lenta' }],
    possibleCauses: ['Sonda lambda degradada'],
    immediateAction: 'Puedes seguir conduciendo con precaución.',
    recommendedChecks: ['Revisar la sonda lambda del banco 1'],
    limitations: ['No se ha confirmado la causa mediante OBD-II'],
    ...overrides
  }
}

describe('watchAssessmentPersistence', () => {
  it('stores the first evaluation the session produces', async () => {
    const current = ref<DiagnosticAssessment | undefined>(undefined)
    const record = vi.fn()

    watchAssessmentPersistence(current, record)
    current.value = assessment()
    await nextTick()

    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(assessment())
  })

  it('does not write a row every time the computed recomputes', async () => {
    const current = ref<DiagnosticAssessment | undefined>(undefined)
    const record = vi.fn()

    watchAssessmentPersistence(current, record)

    current.value = assessment()
    await nextTick()
    // A recomputed but identical evaluation. The reads changed shape, the
    // conclusion did not, and a row per recompute would fill the store with
    // the same finding.
    current.value = assessment()
    await nextTick()

    expect(record).toHaveBeenCalledTimes(1)
  })

  it('stores an evaluation whose conclusion actually changed', async () => {
    const current = ref<DiagnosticAssessment | undefined>(undefined)
    const record = vi.fn()

    watchAssessmentPersistence(current, record)

    current.value = assessment()
    await nextTick()
    current.value = assessment({ severity: 'critical' })
    await nextTick()

    expect(record).toHaveBeenCalledTimes(2)
    expect(record).toHaveBeenLastCalledWith(assessment({ severity: 'critical' }))
  })

  it('records the same fault again after the reads are cleared', async () => {
    const current = ref<DiagnosticAssessment | undefined>(undefined)
    const record = vi.fn()

    watchAssessmentPersistence(current, record)

    current.value = assessment()
    await nextTick()
    // Cleared reads mean a new diagnostic session. The same fault found
    // again is a new observation, not a duplicate to swallow.
    current.value = undefined
    await nextTick()
    current.value = assessment()
    await nextTick()

    expect(record).toHaveBeenCalledTimes(2)
  })

  it('never lets a failing store break the diagnostic', async () => {
    const current = ref<DiagnosticAssessment | undefined>(undefined)
    const record = vi.fn(() => {
      throw new Error('quota')
    })

    watchAssessmentPersistence(current, record)

    expect(() => {
      current.value = assessment()
    }).not.toThrow()

    await nextTick()
    expect(record).toHaveBeenCalledTimes(1)
  })
})

describe('maintenanceSyncOperation', () => {
  it('uses the maintenance record id as a stable idempotency key', () => {
    const first = maintenanceSyncOperation(
      'abc',
      Date.parse('2026-09-02T10:00:00.000Z')
    )
    const later = maintenanceSyncOperation(
      'abc',
      Date.parse('2026-09-02T11:30:00.000Z')
    )

    expect(first.id).toBe('maintenance:abc')
    expect(later.id).toBe('maintenance:abc')
  })

  it('references the maintenance record without snapshotting it', () => {
    const operation = maintenanceSyncOperation(
      'abc',
      Date.parse('2026-09-02T10:00:00.000Z')
    )

    expect(operation).toEqual({
      schemaVersion: 1,
      id: 'maintenance:abc',
      kind: 'maintenance',
      recordId: 'abc',
      enqueuedAt: '2026-09-02T10:00:00.000Z',
      attempts: 0
    })
  })
})

describe('sessionSyncOperation', () => {
  it('keys a session by an id that stays the same across re-enqueues', () => {
    const first = sessionSyncOperation('abc', Date.parse('2026-09-02T10:00:00.000Z'))
    const later = sessionSyncOperation('abc', Date.parse('2026-09-02T11:30:00.000Z'))

    // §15.2: retry without duplicating. The queue writes by id, so the same
    // session offered twice stays one pending operation.
    expect(first.id).toBe(later.id)
    expect(first.id).toBe('session:abc')
  })

  it('points at the session row instead of carrying a copy of it', () => {
    const operation = sessionSyncOperation('abc', Date.parse('2026-09-02T10:00:00.000Z'))

    expect(operation).toEqual({
      schemaVersion: 1,
      id: 'session:abc',
      kind: 'session',
      recordId: 'abc',
      enqueuedAt: '2026-09-02T10:00:00.000Z',
      attempts: 0
    })
  })

  it('distinguishes one session from another', () => {
    const now = Date.parse('2026-09-02T10:00:00.000Z')

    expect(sessionSyncOperation('one', now).id)
      .not.toBe(sessionSyncOperation('two', now).id)
  })
})
