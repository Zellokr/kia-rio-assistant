import type {
  MaintenanceInterval,
  PersistedMaintenanceRecord
} from '../obd/persistence/ports'

/**
 * Projects the next service for each thing the owner maintains (RF-036).
 *
 * Two axes, because a service interval has two: a date and a mileage,
 * whichever arrives first. Both come from the owner — the date from the
 * record, the mileage from the last odometer reading they entered — because
 * this vehicle's odometer is not among the PIDs this project reads and may
 * not be reachable at all (`docs/ODOMETER_PID_VALIDATION.md`).
 *
 * `basedOnOdometer` travels with every result on purpose. A remaining-km
 * figure means nothing without knowing which reading it was measured from
 * and when that reading was taken; showing the number alone would imply the
 * app is tracking the car's mileage, which it is not.
 *
 * This function projects and never advises. It says a service is due, not
 * whether it is safe to keep driving — that judgement belongs to the
 * diagnostics engine, which works from what the vehicle reported.
 */

export interface MaintenanceOdometerReading {
  km: number
  /** The date of the record this reading came from. */
  readAt: string
}

export interface MaintenanceDue {
  /** Spelled as it appears in the most recent record for this item. */
  item: string
  lastPerformedAt: string
  lastOdometerKm: number
  interval: MaintenanceInterval | null
  dueOnDate: string | null
  dueAtKm: number | null
  remainingDays: number | null
  remainingKm: number | null
  overdue: boolean
  /** The reading the mileage axis was measured against, if there is one. */
  basedOnOdometer: MaintenanceOdometerReading | null
}

export interface ComputeMaintenanceDueInput {
  readonly todayMs: number
}

const MS_PER_DAY = 86_400_000

export function computeMaintenanceDue(
  records: readonly PersistedMaintenanceRecord[],
  input: ComputeMaintenanceDueInput
): MaintenanceDue[] {
  if (records.length === 0) {
    return []
  }

  const latestReading = newestReading(records)

  return [...groupByItem(records).values()]
    .map(record => project(record, latestReading, input.todayMs))
    .sort(byUrgency)
}

/**
 * The owner's most recent statement about the car's mileage, wherever it was
 * typed. Taken from the newest record by date rather than the highest number:
 * a mistyped odometer should not become the reading everything is measured
 * against and then stay there forever.
 */
function newestReading(
  records: readonly PersistedMaintenanceRecord[]
): MaintenanceOdometerReading {
  const newest = [...records]
    .sort((left, right) => left.performedAt.localeCompare(right.performedAt))
    .at(-1)!

  return { km: newest.odometerKm, readAt: newest.performedAt }
}

/**
 * One entry per thing maintained, keyed on the item trimmed and lowercased so
 * "Cambio de aceite" and "cambio de aceite" are one service rather than two
 * schedules that each look overdue. The value keeps the newest record, so the
 * spelling shown is the one the owner typed most recently.
 */
function groupByItem(
  records: readonly PersistedMaintenanceRecord[]
): Map<string, PersistedMaintenanceRecord> {
  const latest = new Map<string, PersistedMaintenanceRecord>()

  for (const record of records) {
    const key = record.item.trim().toLowerCase()
    const held = latest.get(key)

    if (!held || record.performedAt > held.performedAt) {
      latest.set(key, record)
    }
  }

  return latest
}

function project(
  record: PersistedMaintenanceRecord,
  reading: MaintenanceOdometerReading,
  todayMs: number
): MaintenanceDue {
  const dueOnDate = record.interval?.months
    ? addMonths(record.performedAt, record.interval.months)
    : null

  const dueAtKm = record.interval?.km
    ? record.odometerKm + record.interval.km
    : null

  const remainingDays = dueOnDate === null
    ? null
    : Math.round((parseDate(dueOnDate) - todayMs) / MS_PER_DAY)

  const remainingKm = dueAtKm === null
    ? null
    : dueAtKm - reading.km

  return {
    item: record.item.trim(),
    lastPerformedAt: record.performedAt,
    lastOdometerKm: record.odometerKm,
    interval: record.interval,
    dueOnDate,
    dueAtKm,
    remainingDays,
    remainingKm,
    // Whichever axis arrives first decides, which is how a service interval
    // is written on paper: every 15 000 km **or** 12 months.
    overdue: (remainingDays !== null && remainingDays < 0)
      || (remainingKm !== null && remainingKm < 0),
    basedOnOdometer: dueAtKm === null ? null : reading
  }
}

/**
 * Adds whole months, clamping to the end of a shorter month.
 *
 * Plain `setMonth` turns 31 January plus one month into 3 March, which reads
 * as a bug to anyone holding a service book: a service due "in a month" from
 * the end of January is due in February.
 */
function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const targetMonthIndex = month - 1 + months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()

  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonth + 1).padStart(2, '0'),
    String(Math.min(day, lastDay)).padStart(2, '0')
  ].join('-')
}

/** Parsed as UTC so a due date does not shift with the phone's timezone. */
function parseDate(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]

  return Date.UTC(year, month - 1, day)
}

/**
 * Most urgent first, without ever comparing kilometres to days.
 *
 * There is no honest way to rank "500 km left" against "200 days left": it
 * depends on how much this car is driven, and the app does not know that.
 * Reducing both to one number would invent that knowledge, so the two axes
 * are ordered as groups instead.
 *
 * Overdue comes first because it is the one comparison that needs no unit —
 * a service is either past due or it is not. Then dated services, because a
 * date is absolute. Then mileage-only ones, whose distance is measured from
 * a reading that may already be old. Then services with no interval, which
 * make no claim and so cannot compete with one that does.
 */
function byUrgency(left: MaintenanceDue, right: MaintenanceDue): number {
  if (left.overdue !== right.overdue) {
    return left.overdue ? -1 : 1
  }

  const leftAxis = axisRank(left)
  const rightAxis = axisRank(right)

  if (leftAxis !== rightAxis) {
    return leftAxis - rightAxis
  }

  const remaining = compareWithinAxis(left, right, leftAxis)

  return remaining !== 0 ? remaining : left.item.localeCompare(right.item)
}

const DATED = 0
const MILEAGE_ONLY = 1
const NO_INTERVAL = 2

function axisRank(due: MaintenanceDue): number {
  if (due.remainingDays !== null) {
    return DATED
  }

  return due.remainingKm !== null ? MILEAGE_ONLY : NO_INTERVAL
}

function compareWithinAxis(
  left: MaintenanceDue,
  right: MaintenanceDue,
  axis: number
): number {
  if (axis === DATED) {
    return left.remainingDays! - right.remainingDays!
  }

  return axis === MILEAGE_ONLY
    ? left.remainingKm! - right.remainingKm!
    : 0
}
