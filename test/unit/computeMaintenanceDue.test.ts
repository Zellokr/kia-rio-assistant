import { describe, expect, it } from 'vitest'

import {
  computeMaintenanceDue
} from '../../core/maintenance/computeMaintenanceDue'
import type {
  PersistedMaintenanceRecord
} from '../../core/obd/persistence/ports'

/**
 * RF-036: *"Se muestran próximos vencimientos sin depender de la ECU."*
 *
 * Every number here was typed by the owner. This vehicle's odometer is not
 * among the PIDs this project reads — and whether it is even reachable is an
 * open question, see `docs/ODOMETER_PID_VALIDATION.md` — so the mileage axis
 * is computed against the last reading the owner entered, and the result
 * says which reading that was. A due-date screen that hid its own source
 * would be implying live tracking the app does not have.
 */

function record(
  overrides: Partial<PersistedMaintenanceRecord> = {}
): PersistedMaintenanceRecord {
  return {
    schemaVersion: 1,
    id: 'r1',
    performedAt: '2026-01-15',
    odometerKm: 90_000,
    item: 'Cambio de aceite y filtro',
    notes: null,
    interval: { km: 15_000, months: 12 },
    ...overrides
  }
}

const today = Date.parse('2026-09-02T00:00:00.000Z')

describe('computeMaintenanceDue', () => {
  it('returns nothing when the owner has recorded nothing', () => {
    expect(computeMaintenanceDue([], { todayMs: today })).toEqual([])
  })

  it('projects the next service from the interval the owner entered', () => {
    const [due] = computeMaintenanceDue([record()], { todayMs: today })

    expect(due?.item).toBe('Cambio de aceite y filtro')
    expect(due?.dueAtKm).toBe(105_000)
    expect(due?.dueOnDate).toBe('2027-01-15')
  })

  it('measures the mileage axis against the last reading the owner entered', () => {
    const records = [
      record({ id: 'r1' }),
      record({
        id: 'r2',
        item: 'Revisión de frenos',
        performedAt: '2026-08-01',
        odometerKm: 98_000,
        interval: { km: 30_000, months: null }
      })
    ]

    const oil = computeMaintenanceDue(records, { todayMs: today })
      .find(due => due.item === 'Cambio de aceite y filtro')

    // 105 000 due, and the newest reading the owner gave is 98 000.
    expect(oil?.remainingKm).toBe(7_000)
    expect(oil?.basedOnOdometer).toEqual({ km: 98_000, readAt: '2026-08-01' })
  })

  /**
   * A mistyped odometer must not become the reading everything is measured
   * against and then stay there forever, which is what taking the highest
   * number would do. The newest record wins instead: the owner's most recent
   * statement about the car is the one to believe.
   */
  it('believes the newest reading, not the largest one', () => {
    const dues = computeMaintenanceDue([
      // A digit too many, entered in March.
      record({ id: 'typo', item: 'Frenos', performedAt: '2026-03-01', odometerKm: 940_000, interval: null }),
      record({ id: 'real', item: 'Aceite', performedAt: '2026-08-01', odometerKm: 98_000 })
    ], { todayMs: today })

    const oil = dues.find(due => due.item === 'Aceite')

    expect(oil?.basedOnOdometer).toEqual({ km: 98_000, readAt: '2026-08-01' })
    expect(oil?.remainingKm).toBe(15_000)
  })

  it('counts the days left against today', () => {
    const [due] = computeMaintenanceDue([record()], { todayMs: today })

    // 2026-01-15 + 12 months = 2027-01-15, which is 135 days after 2026-09-02.
    expect(due?.remainingDays).toBe(135)
  })

  it('marks a service overdue when its date has passed', () => {
    const [due] = computeMaintenanceDue(
      [record({ performedAt: '2025-01-15' })],
      { todayMs: today }
    )

    expect(due?.remainingDays).toBeLessThan(0)
    expect(due?.overdue).toBe(true)
  })

  it('marks a service overdue when the mileage has passed it', () => {
    const [due] = computeMaintenanceDue(
      [record({ odometerKm: 90_000, interval: { km: 5_000, months: null } })],
      { todayMs: today }
    )

    // Due at 95 000 and the only reading is 90 000, so not overdue yet.
    expect(due?.overdue).toBe(false)

    const [passed] = computeMaintenanceDue(
      [
        record({ odometerKm: 90_000, interval: { km: 5_000, months: null } }),
        record({ id: 'r2', item: 'Otro', performedAt: '2026-08-01', odometerKm: 99_000, interval: null })
      ],
      { todayMs: today }
    )

    expect(passed?.overdue).toBe(true)
  })

  it('uses only the most recent service of each item', () => {
    const dues = computeMaintenanceDue([
      record({ id: 'old', performedAt: '2024-01-15', odometerKm: 60_000 }),
      record({ id: 'new', performedAt: '2026-01-15', odometerKm: 90_000 })
    ], { todayMs: today })

    expect(dues).toHaveLength(1)
    expect(dues[0]?.dueAtKm).toBe(105_000)
    expect(dues[0]?.lastPerformedAt).toBe('2026-01-15')
  })

  it('groups the same item typed with different capitalisation', () => {
    const dues = computeMaintenanceDue([
      record({ id: 'a', item: 'Cambio de aceite' }),
      record({ id: 'b', item: '  cambio DE aceite ', performedAt: '2026-03-01', odometerKm: 93_000 })
    ], { todayMs: today })

    expect(dues).toHaveLength(1)
    // The spelling shown is the one from the most recent record, trimmed.
    expect(dues[0]?.item).toBe('cambio DE aceite')
  })

  it('clamps a month interval to the end of a shorter month', () => {
    const [due] = computeMaintenanceDue(
      [record({ performedAt: '2026-01-31', interval: { km: null, months: 1 } })],
      { todayMs: today }
    )

    // Not 2026-03-03. A service due "in a month" from 31 January is due in
    // February, and February is what the owner will look at.
    expect(due?.dueOnDate).toBe('2026-02-28')
  })

  it('keeps a record with no interval, and claims nothing about it', () => {
    const [due] = computeMaintenanceDue(
      [record({ interval: null })],
      { todayMs: today }
    )

    expect(due?.dueOnDate).toBeNull()
    expect(due?.dueAtKm).toBeNull()
    expect(due?.remainingDays).toBeNull()
    expect(due?.remainingKm).toBeNull()
    expect(due?.overdue).toBe(false)
  })

  it('handles an interval with only one of the two axes', () => {
    const [byKm] = computeMaintenanceDue(
      [record({ interval: { km: 15_000, months: null } })],
      { todayMs: today }
    )

    expect(byKm?.dueAtKm).toBe(105_000)
    expect(byKm?.dueOnDate).toBeNull()

    const [byMonths] = computeMaintenanceDue(
      [record({ interval: { km: null, months: 12 } })],
      { todayMs: today }
    )

    expect(byMonths?.dueAtKm).toBeNull()
    expect(byMonths?.dueOnDate).toBe('2027-01-15')
  })

  /**
   * There is no honest way to compare "500 km left" with "200 days left"
   * without knowing how much this car is driven, and the app does not know
   * that. So the two axes are ordered as groups instead of being mixed into
   * one number: dated services first, because a date is absolute, then
   * mileage-only ones, whose distance depends on a reading that may be old.
   */
  it('never compares kilometres against days', () => {
    const dues = computeMaintenanceDue([
      record({
        id: 'km',
        item: 'Frenos',
        performedAt: '2026-08-01',
        odometerKm: 98_000,
        // 100 km away: a smaller number than any day count below.
        interval: { km: 100, months: null }
      }),
      record({
        id: 'date',
        item: 'Aceite',
        performedAt: '2026-01-15',
        odometerKm: 90_000,
        interval: { km: null, months: 12 }
      })
    ], { todayMs: today })

    expect(dues.map(due => due.item)).toEqual(['Aceite', 'Frenos'])
  })

  it('puts an overdue service ahead of everything else', () => {
    const dues = computeMaintenanceDue([
      record({ id: 'soon', item: 'Aceite', performedAt: '2026-08-20', interval: { km: null, months: 1 } }),
      record({ id: 'late', item: 'Frenos', performedAt: '2024-01-15', interval: { km: null, months: 12 } })
    ], { todayMs: today })

    expect(dues.map(due => due.item)).toEqual(['Frenos', 'Aceite'])
    expect(dues[0]?.overdue).toBe(true)
  })

  it('orders the most urgent service first', () => {
    const dues = computeMaintenanceDue([
      record({ id: 'far', item: 'Bujías', performedAt: '2026-08-01', interval: { km: null, months: 24 } }),
      record({ id: 'near', item: 'Aceite', performedAt: '2025-09-15', interval: { km: null, months: 12 } })
    ], { todayMs: today })

    expect(dues.map(due => due.item)).toEqual(['Aceite', 'Bujías'])
  })
})
