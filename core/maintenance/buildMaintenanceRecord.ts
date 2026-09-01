import type {
  MaintenanceInterval,
  PersistedMaintenanceRecord
} from '../obd/persistence/ports'

/**
 * Turns what the owner typed into a row, or refuses.
 *
 * Returning `null` rather than throwing follows `buildAssistantRequest`: a
 * form that is not ready yet is an ordinary state, not an error, and the
 * caller decides what to say about it.
 *
 * Everything here is validation of a person's input, not of the vehicle's.
 * The strictness is deliberate on two fields in particular. An odometer that
 * is not a real reading would become the baseline every projection is
 * measured from, and an interval of zero would make a service permanently
 * overdue — both would produce a screen that is confidently wrong.
 */

export interface MaintenanceRecordInput {
  /** `YYYY-MM-DD`, as an `<input type="date">` produces it. */
  readonly performedAt: string
  readonly odometerKm: number
  readonly item: string
  readonly notes: string
  readonly intervalKm: number | null
  readonly intervalMonths: number | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

let sequence = 0

export function buildMaintenanceRecord(
  input: MaintenanceRecordInput,
  nowMs: number
): PersistedMaintenanceRecord | null {
  const item = input.item.trim()

  if (item.length === 0 || !isCalendarDate(input.performedAt)) {
    return null
  }

  if (!Number.isFinite(input.odometerKm) || input.odometerKm < 0) {
    return null
  }

  const interval = buildInterval(input)

  if (interval === 'invalid') {
    return null
  }

  const notes = input.notes.trim()

  return {
    schemaVersion: 1,
    // The counter is what keeps two records written in the same millisecond
    // apart. Without it a fast double submit would overwrite the first row,
    // since the store writes by id.
    id: `maintenance:${nowMs}:${++sequence}`,
    performedAt: input.performedAt,
    odometerKm: input.odometerKm,
    item,
    notes: notes.length > 0 ? notes : null,
    interval
  }
}

/**
 * `null` when the owner named neither axis — a service logged without saying
 * when it repeats is still worth keeping — and `'invalid'` when they named
 * one that cannot describe a repeat.
 */
function buildInterval(
  input: MaintenanceRecordInput
): MaintenanceInterval | null | 'invalid' {
  const km = input.intervalKm
  const months = input.intervalMonths

  if (km === null && months === null) {
    return null
  }

  if (!isPositive(km) || !isPositive(months)) {
    return 'invalid'
  }

  return { km, months }
}

function isPositive(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value > 0)
}

/**
 * Rejects a shape `<input type="date">` cannot produce, and also a date that
 * looks right but does not exist — `2026-02-31` round-trips through `Date`
 * as 3 March, which would silently move a service a month.
 */
function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const parsed = new Date(Date.UTC(year, month - 1, day))

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}
