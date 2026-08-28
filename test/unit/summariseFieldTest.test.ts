import { describe, expect, it } from 'vitest'

import {
  formatFieldTestReport,
  summariseFieldTest,
  summariseSession
} from '../../core/obd/fieldTest/summariseFieldTest'
import type { ObdSessionEvent } from '../../core/obd/logging/ObdSessionLog'

/**
 * TEMPORARY — field-test evidence delivery. Delete with
 * `app/services/telegramFieldLog.ts`; see `docs/FIELD_TEST_TELEGRAM.md`.
 *
 * This replaces a notebook. If it miscounts, the field test produces a
 * confident wrong answer about a car — which is worse than producing none,
 * because nobody would go back and check.
 */
let sequence = 0

function event(partial: Record<string, unknown>, elapsedMs = 0): ObdSessionEvent {
  sequence += 1

  return {
    sequence,
    timestamp: new Date(1_800_000_000_000 + elapsedMs).toISOString(),
    elapsedMs,
    ...partial
  } as ObdSessionEvent
}

function reset() {
  sequence = 0
}

describe('summariseSession', () => {
  it('reports how long the session took to reach ready', () => {
    reset()

    const summary = summariseSession('s1', '2026-08-28T10:00:00.000Z', [
      event({ type: 'session-state', state: 'connecting' }, 0),
      event({ type: 'session-state', state: 'ready' }, 4200)
    ])

    expect(summary.reachedReady).toBe(true)
    expect(summary.msToReady).toBe(4200)
  })

  it('records a session that never got there, with the phases that failed', () => {
    reset()

    const summary = summariseSession('s2', '2026-08-28T10:05:00.000Z', [
      event({ type: 'session-state', state: 'connecting' }, 0),
      event({
        type: 'error',
        error: { name: 'Error', message: 'nope', phase: 'connection' }
      }, 900),
      event({ type: 'session-state', state: 'error' }, 950)
    ])

    expect(summary.reachedReady).toBe(false)
    expect(summary.msToReady).toBeUndefined()
    expect(summary.errorPhases).toEqual(['connection'])
  })

  /**
   * The A2 question. A link that reconnects but never resumes polling looks
   * identical to a healthy one from the badge alone, which is exactly the
   * failure the part exists to catch.
   */
  it('separates a recovery that resumed readings from one that did not', () => {
    reset()

    const resumed = summariseSession('s3', '2026-08-28T10:10:00.000Z', [
      event({ type: 'session-state', state: 'ready' }, 3000),
      event({ type: 'activity', activity: 'reconnect-started' }, 60_000),
      event({ type: 'activity', activity: 'reconnect-attempt' }, 61_000),
      event({ type: 'activity', activity: 'reconnected' }, 68_000),
      event({
        type: 'decoded-value',
        source: 'telemetry',
        command: '010C',
        latencyMs: 40,
        decoded: { kind: 'pid', key: 'engineRpm', pid: '010C', label: 'RPM', value: 800, unit: 'rpm' }
      }, 70_000)
    ])

    expect(resumed.dropsDetected).toBe(1)
    expect(resumed.recoveries).toBe(1)
    expect(resumed.recoveryMs).toEqual([8000])
    expect(resumed.telemetryResumedAfterRecovery).toBe(true)

    reset()

    const dead = summariseSession('s4', '2026-08-28T10:20:00.000Z', [
      event({
        type: 'decoded-value',
        source: 'telemetry',
        command: '010C',
        latencyMs: 40,
        decoded: { kind: 'pid', key: 'engineRpm', pid: '010C', label: 'RPM', value: 800, unit: 'rpm' }
      }, 10_000),
      event({ type: 'activity', activity: 'reconnect-started' }, 60_000),
      event({ type: 'activity', activity: 'reconnected' }, 66_000)
    ])

    expect(dead.telemetryResumedAfterRecovery).toBe(false)
  })

  /**
   * The defect the car exposed on 2026-08-28. The last session had been
   * created but its events were still buffered, so storage held a record
   * with nothing in it — and the summary called that "did not reach ready",
   * a claim about the vehicle built out of data that was never written.
   */
  it('marks a session with no events as unrecorded, not as failed', () => {
    reset()

    const summary = summariseSession('s0', '2026-08-28T10:00:00.000Z', [])

    expect(summary.recorded).toBe(false)
    expect(summary.reachedReady).toBe(false)
  })

  it('leaves the resumed question unanswered when nothing ever dropped', () => {
    reset()

    const summary = summariseSession('s5', '2026-08-28T10:30:00.000Z', [
      event({ type: 'session-state', state: 'ready' }, 2000)
    ])

    expect(summary.telemetryResumedAfterRecovery).toBeUndefined()
  })
})

describe('summariseFieldTest', () => {
  /**
   * A1's actual claim is ten *consecutive*, and a run that breaks in the
   * middle is the failure it is looking for. Counting successes alone would
   * report nine-of-ten as nearly passing when it is not.
   */
  it('measures the consecutive streak, not the total', () => {
    const sessions = [true, true, false, true, true, true].map(
      (reachedReady, index) => ({
        sessionId: `s${index}`,
        startedAt: '2026-08-28T10:00:00.000Z',
        recorded: true,
        msToReady: reachedReady ? 3000 : undefined,
        reachedReady,
        errorPhases: [],
        dropsDetected: 0,
        reconnectAttempts: 0,
        recoveries: 0,
        recoveryMs: [],
        telemetryResumedAfterRecovery: undefined,
        telemetryReadings: 0
      })
    )

    const summary = summariseFieldTest(sessions)

    expect(summary.sessionsReachingReady).toBe(5)
    expect(summary.longestReadyStreak).toBe(3)
  })
})

describe('summariseFieldTest with unrecorded sessions', () => {
  function session(recorded: boolean, reachedReady: boolean, id: string) {
    return {
      sessionId: id,
      startedAt: '2026-08-28T10:00:00.000Z',
      recorded,
      msToReady: reachedReady ? 3000 : undefined,
      reachedReady,
      errorPhases: [],
      dropsDetected: 0,
      reconnectAttempts: 0,
      recoveries: 0,
      recoveryMs: [],
      telemetryResumedAfterRecovery: undefined,
      telemetryReadings: 0
    }
  }

  /**
   * An unrecorded session neither extends the run nor breaks it. Both would
   * be claims the data does not support, so it is counted separately and
   * the streak is read over what was actually recorded.
   */
  it('does not let a session with no data break the streak', () => {
    const summary = summariseFieldTest([
      session(true, true, 'a'),
      session(true, true, 'b'),
      session(false, false, 'empty'),
      session(true, true, 'c')
    ])

    expect(summary.longestReadyStreak).toBe(3)
    expect(summary.sessionsWithoutData).toBe(1)
  })

  it('reports how many sessions carried no data at all', () => {
    const report = formatFieldTestReport(summariseFieldTest([
      session(true, true, 'a'),
      session(false, false, 'empty')
    ]))

    expect(report).toContain('Sin datos: 1')
    expect(report).toContain('2. sin eventos registrados')
    expect(report).not.toContain('2. NO llegó a preparado')
  })

  it('counts readiness against the sessions that have data', () => {
    const report = formatFieldTestReport(summariseFieldTest([
      session(true, true, 'a'),
      session(false, false, 'empty')
    ]))

    expect(report).toContain('Llegaron a preparado: 1 de 1 con datos')
  })
})

describe('formatFieldTestReport', () => {
  function summaryWith(drops: number) {
    return summariseFieldTest([{
      sessionId: 's1',
      startedAt: '2026-08-28T10:00:00.000Z',
      recorded: true,
      msToReady: 4200,
      reachedReady: true,
      errorPhases: [],
      dropsDetected: drops,
      reconnectAttempts: drops,
      recoveries: drops,
      recoveryMs: drops > 0 ? [8000] : [],
      telemetryResumedAfterRecovery: drops > 0 ? true : undefined,
      telemetryReadings: 12
    }])
  }

  /**
   * The one line that stops somebody driving home too early: thirty minutes
   * with no drop is an unfinished test, not a pass.
   */
  it('says so when no drop was ever recorded', () => {
    expect(formatFieldTestReport(summaryWith(0)))
      .toContain('Ninguna caída registrada')
  })

  it('drops that warning once a drop and its recovery are on record', () => {
    const report = formatFieldTestReport(summaryWith(1))

    expect(report).not.toContain('Ninguna caída registrada')
    expect(report).toContain('recuperación en 8.0 s')
    expect(report).toContain('lecturas reanudadas')
  })

  it('leads with the numbers that decide whether to keep testing', () => {
    const lines = formatFieldTestReport(summaryWith(1)).split('\n')

    expect(lines[0]).toBe('INFORME DE CAMPO')
    expect(lines.slice(0, 7).join('\n')).toContain('Racha seguida sin fallo')
  })
})
