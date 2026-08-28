import type { ObdTelemetryMetric } from './ObdTelemetryStore'

/**
 * How old a reading may be before it stops being a claim about now.
 *
 * The slowest telemetry task polls every 3000 ms
 * (`createSupportedTelemetryPollTasks`), so a healthy reading is refreshed
 * well inside that. 6000 ms is two of those intervals: long enough that a
 * single slow round trip or a retried command does not flicker the display,
 * short enough that a driver is not shown a number the vehicle stopped
 * confirming.
 */
export const METRIC_STALE_AFTER_MS = 6000

/**
 * Milliseconds since a reading was taken, or `undefined` when there is no
 * reading or its timestamp cannot be read.
 *
 * A timestamp that does not parse returns `undefined` rather than a wild
 * age: an unreadable clock is a reason to say nothing about freshness, not
 * a reason to invent a number.
 */
export function metricAgeMs(
  metric: ObdTelemetryMetric | undefined,
  nowMs: number
): number | undefined {
  if (!metric) {
    return undefined
  }

  const takenAtMs = Date.parse(metric.updatedAt)

  if (Number.isNaN(takenAtMs)) {
    return undefined
  }

  // Clamped at zero. A device clock that steps backwards mid-session must
  // not render a reading as arriving from the future.
  return Math.max(0, nowMs - takenAtMs)
}

/**
 * Whether a reading is too old to be shown as current.
 *
 * This is the defect found at the car on 2026-08-28. The cards displayed a
 * value and the round-trip time of the command that fetched it — never how
 * old it was — so a frozen reading and a live one were pixel-identical:
 * a large bold number over a plausible "40 ms". Polling could stop, the
 * link could drop, and the screen kept asserting the engine was doing
 * something it had stopped confirming minutes earlier.
 *
 * A reading with no usable timestamp counts as stale. The alternative is
 * presenting an unknown age as a fresh one, which is the failure this
 * exists to end.
 */
export function isMetricStale(
  metric: ObdTelemetryMetric | undefined,
  nowMs: number,
  staleAfterMs: number = METRIC_STALE_AFTER_MS
): boolean {
  if (!metric) {
    return false
  }

  const age = metricAgeMs(metric, nowMs)

  return age === undefined || age >= staleAfterMs
}
