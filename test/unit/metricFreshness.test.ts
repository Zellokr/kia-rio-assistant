import { describe, expect, it } from 'vitest'

import {
  METRIC_STALE_AFTER_MS,
  isMetricStale,
  metricAgeMs
} from '../../core/obd/telemetry/metricFreshness'
import type {
  ObdTelemetryMetric
} from '../../core/obd/telemetry/ObdTelemetryStore'

/**
 * Found at the car on 2026-08-28: the metric cards showed a value and the
 * round-trip time of the command that fetched it, never its age. A reading
 * frozen for minutes was pixel-identical to a live one — a bold number over
 * a credible "40 ms" — so the screen kept asserting the engine was doing
 * something it had stopped confirming.
 *
 * These are about the one thing that matters: a stale reading must never
 * pass as fresh.
 */
const NOW = Date.parse('2026-08-28T15:00:00.000Z')

function metric(updatedAt: string): ObdTelemetryMetric {
  return {
    key: 'engineRpm',
    pid: '010C',
    label: 'RPM',
    value: 812,
    unit: 'rpm',
    updatedAt,
    latencyMs: 40
  }
}

describe('metricAgeMs', () => {
  it('measures how long ago the reading was taken', () => {
    expect(metricAgeMs(metric('2026-08-28T14:59:57.000Z'), NOW)).toBe(3000)
  })

  it('has no age for a metric that does not exist', () => {
    expect(metricAgeMs(undefined, NOW)).toBeUndefined()
  })

  it('has no age when the timestamp cannot be read', () => {
    expect(metricAgeMs(metric('not a date'), NOW)).toBeUndefined()
  })

  /**
   * A device clock that steps backwards mid-session must not render a
   * reading as arriving from the future, which would make it look newer
   * than anything else on screen.
   */
  it('never reports a reading from the future', () => {
    expect(metricAgeMs(metric('2026-08-28T15:00:30.000Z'), NOW)).toBe(0)
  })
})

describe('isMetricStale', () => {
  it('trusts a reading taken within the window', () => {
    expect(isMetricStale(metric('2026-08-28T14:59:58.000Z'), NOW)).toBe(false)
  })

  it('stops trusting one older than the window', () => {
    expect(isMetricStale(metric('2026-08-28T14:59:50.000Z'), NOW)).toBe(true)
  })

  it('treats the boundary itself as stale', () => {
    const atBoundary = new Date(NOW - METRIC_STALE_AFTER_MS).toISOString()

    expect(isMetricStale(metric(atBoundary), NOW)).toBe(true)
  })

  /**
   * An unknown age is not a fresh one. Presenting it as current would be
   * the exact failure this module exists to end.
   */
  it('treats an unreadable timestamp as stale rather than as current', () => {
    expect(isMetricStale(metric('not a date'), NOW)).toBe(true)
  })

  /**
   * A card with no reading shows an em dash, not a stale value. Marking it
   * stale would put a "the car stopped answering" warning on a screen that
   * has simply never been polled.
   */
  it('says nothing about a metric that was never read', () => {
    expect(isMetricStale(undefined, NOW)).toBe(false)
  })

  /**
   * The slowest telemetry task polls every 3000 ms, so the window has to
   * clear two of those without flickering.
   */
  it('leaves room for the slowest poll interval to miss once', () => {
    expect(METRIC_STALE_AFTER_MS).toBeGreaterThanOrEqual(6000)
  })
})
