import { describe, expect, it } from 'vitest'

import {
  buildMaintenanceRecord
} from '../../core/maintenance/buildMaintenanceRecord'

const nowMs = Date.parse('2026-09-02T18:00:00.000Z')

function input(overrides: Record<string, unknown> = {}) {
  return {
    performedAt: '2026-08-14',
    odometerKm: 92_400,
    item: 'Cambio de aceite y filtro',
    notes: '',
    intervalKm: 15_000,
    intervalMonths: 12,
    ...overrides
  }
}

describe('buildMaintenanceRecord', () => {
  it('builds a record from what the owner typed', () => {
    const record = buildMaintenanceRecord(input(), nowMs)

    expect(record).toMatchObject({
      schemaVersion: 1,
      performedAt: '2026-08-14',
      odometerKm: 92_400,
      item: 'Cambio de aceite y filtro',
      notes: null,
      interval: { km: 15_000, months: 12 }
    })
  })

  it('trims the item and keeps notes only when there are any', () => {
    expect(buildMaintenanceRecord(input({ item: '  Frenos  ' }), nowMs)?.item)
      .toBe('Frenos')
    expect(buildMaintenanceRecord(input({ notes: '   ' }), nowMs)?.notes)
      .toBeNull()
    expect(buildMaintenanceRecord(input({ notes: ' taller X ' }), nowMs)?.notes)
      .toBe('taller X')
  })

  it('records no interval when the owner gave neither axis', () => {
    const record = buildMaintenanceRecord(
      input({ intervalKm: null, intervalMonths: null }),
      nowMs
    )

    expect(record?.interval).toBeNull()
  })

  it('keeps an interval that names only one axis', () => {
    expect(buildMaintenanceRecord(input({ intervalMonths: null }), nowMs)?.interval)
      .toEqual({ km: 15_000, months: null })
    expect(buildMaintenanceRecord(input({ intervalKm: null }), nowMs)?.interval)
      .toEqual({ km: null, months: 12 })
  })

  it('refuses a record with nothing naming what was done', () => {
    expect(buildMaintenanceRecord(input({ item: '   ' }), nowMs)).toBeNull()
  })

  it('refuses an odometer that is not a real reading', () => {
    expect(buildMaintenanceRecord(input({ odometerKm: -1 }), nowMs)).toBeNull()
    expect(buildMaintenanceRecord(input({ odometerKm: Number.NaN }), nowMs)).toBeNull()
  })

  it('refuses a date that is not a calendar date', () => {
    expect(buildMaintenanceRecord(input({ performedAt: '' }), nowMs)).toBeNull()
    expect(buildMaintenanceRecord(input({ performedAt: '14/08/2026' }), nowMs)).toBeNull()
    expect(buildMaintenanceRecord(input({ performedAt: '2026-02-31' }), nowMs)).toBeNull()
  })

  it('refuses an interval that is zero or negative', () => {
    // "Every 0 km" would make a service permanently overdue.
    expect(buildMaintenanceRecord(input({ intervalKm: 0, intervalMonths: null }), nowMs))
      .toBeNull()
    expect(buildMaintenanceRecord(input({ intervalKm: null, intervalMonths: -3 }), nowMs))
      .toBeNull()
  })

  it('gives two records written in the same millisecond different ids', () => {
    const first = buildMaintenanceRecord(input(), nowMs)
    const second = buildMaintenanceRecord(input({ item: 'Frenos' }), nowMs)

    expect(first?.id).not.toBe(second?.id)
  })
})
