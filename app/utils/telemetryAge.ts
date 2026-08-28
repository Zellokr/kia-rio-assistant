import {
  isMetricStale,
  metricAgeMs
} from '~~/core/obd/telemetry/metricFreshness'
import type {
  ObdTelemetryMetric
} from '~~/core/obd/telemetry/ObdTelemetryStore'

export interface MetricFreshness {
  /** Empty when there is no reading at all. */
  readonly label: string
  readonly stale: boolean
}

function describeAge(ageMs: number): string {
  if (ageMs < 2000) {
    return 'ahora mismo'
  }

  if (ageMs < 60_000) {
    return `hace ${Math.round(ageMs / 1000)} s`
  }

  const minutes = Math.floor(ageMs / 60_000)

  return minutes === 1 ? 'hace 1 min' : `hace ${minutes} min`
}

/**
 * How a reading's age reads on a metric card.
 *
 * The cards used to show `${latencyMs} ms` under every number, which is how
 * long the adapter took to answer that command — not how old the answer is.
 * A reading frozen for three minutes still displayed a credible "40 ms".
 * Age is what a driver needs; latency is diagnostic detail and belongs in
 * the log.
 */
export function describeMetricFreshness(
  metric: ObdTelemetryMetric | undefined,
  nowMs: number
): MetricFreshness {
  if (!metric) {
    return { label: '', stale: false }
  }

  const age = metricAgeMs(metric, nowMs)
  const stale = isMetricStale(metric, nowMs)

  if (age === undefined) {
    return { label: 'Antigüedad desconocida', stale: true }
  }

  return {
    label: stale ? `Sin actualizar ${describeAge(age)}` : describeAge(age),
    stale
  }
}
