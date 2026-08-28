import type { ObdSessionEvent } from '../logging/ObdSessionLog'

/**
 * TEMPORARY — field-test evidence delivery. Delete with
 * `app/services/telegramFieldLog.ts`; see `docs/FIELD_TEST_TELEGRAM.md`.
 *
 * Turns recorded sessions into the observations the field test asks a human
 * to write in a notebook.
 *
 * Every one of those observations — did it reach ready, how long it took,
 * what needed a retry, whether a drop was detected, whether recovery
 * happened, whether telemetry came back afterwards — is already in the
 * event log. The notebook existed because nobody had written the reader,
 * not because the data was missing. Reading a small screen next to a
 * running engine and transcribing timings by hand is also the least
 * reliable instrument in the whole procedure.
 *
 * This is deliberately descriptive. It reports what the log contains and
 * never decides that a part passed: a summary that graded itself would be
 * the same failure as a test that asserts its own source text.
 */

export interface FieldTestSessionSummary {
  readonly sessionId: string
  readonly startedAt: string
  /** Milliseconds from the first event to reaching `ready`, when it did. */
  readonly msToReady: number | undefined
  readonly reachedReady: boolean
  readonly errorPhases: readonly string[]
  readonly dropsDetected: number
  readonly reconnectAttempts: number
  readonly recoveries: number
  /** Milliseconds from a drop being noticed to `reconnected`, per recovery. */
  readonly recoveryMs: readonly number[]
  /**
   * Whether any telemetry reading arrived AFTER the last recovery. The
   * question A2 exists to answer: a link that reconnects but never resumes
   * polling looks identical to a healthy one from the badge alone.
   */
  readonly telemetryResumedAfterRecovery: boolean | undefined
  readonly telemetryReadings: number
}

export interface FieldTestSummary {
  readonly sessions: readonly FieldTestSessionSummary[]
  readonly totalSessions: number
  readonly sessionsReachingReady: number
  /** The longest run of consecutive sessions that reached ready. */
  readonly longestReadyStreak: number
  readonly totalDrops: number
  readonly totalRecoveries: number
}

function isActivity(
  event: ObdSessionEvent,
  activity: string
): boolean {
  return event.type === 'activity' && event.activity === activity
}

export function summariseSession(
  sessionId: string,
  startedAt: string,
  events: readonly ObdSessionEvent[]
): FieldTestSessionSummary {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence)

  const ready = ordered.find(
    event => event.type === 'session-state' && event.state === 'ready'
  )

  const errorPhases = ordered
    .filter(event => event.type === 'error')
    .map(event => (event as Extract<ObdSessionEvent, { type: 'error' }>).error.phase)

  const drops = ordered.filter(event => isActivity(event, 'reconnect-started'))
  const attempts = ordered.filter(event => isActivity(event, 'reconnect-attempt'))
  const recovered = ordered.filter(event => isActivity(event, 'reconnected'))

  /**
   * Paired by order, not by identity: the log carries no reconnection id, so
   * the nth recovery is read against the nth drop. A recovery with no drop
   * before it is skipped rather than paired with the wrong one.
   */
  const recoveryMs: number[] = []

  for (let index = 0; index < recovered.length; index++) {
    const drop = drops[index]
    const recovery = recovered[index]

    if (drop && recovery) {
      recoveryMs.push(recovery.elapsedMs - drop.elapsedMs)
    }
  }

  const lastRecovery = recovered[recovered.length - 1]
  const telemetry = ordered.filter(
    event => event.type === 'decoded-value' && event.source === 'telemetry'
  )

  return {
    sessionId,
    startedAt,
    msToReady: ready?.elapsedMs,
    reachedReady: ready !== undefined,
    errorPhases,
    dropsDetected: drops.length,
    reconnectAttempts: attempts.length,
    recoveries: recovered.length,
    recoveryMs,
    telemetryResumedAfterRecovery: lastRecovery === undefined
      ? undefined
      : telemetry.some(event => event.sequence > lastRecovery.sequence),
    telemetryReadings: telemetry.length
  }
}

export function summariseFieldTest(
  sessions: readonly FieldTestSessionSummary[]
): FieldTestSummary {
  let streak = 0
  let longestReadyStreak = 0

  for (const session of sessions) {
    streak = session.reachedReady ? streak + 1 : 0
    longestReadyStreak = Math.max(longestReadyStreak, streak)
  }

  return {
    sessions,
    totalSessions: sessions.length,
    sessionsReachingReady: sessions.filter(s => s.reachedReady).length,
    longestReadyStreak,
    totalDrops: sessions.reduce((sum, s) => sum + s.dropsDetected, 0),
    totalRecoveries: sessions.reduce((sum, s) => sum + s.recoveries, 0)
  }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

/**
 * The report as it reads in Telegram.
 *
 * Written for someone standing next to a car who wants to know whether to
 * stop or keep going, so the two numbers that decide that — the consecutive
 * ready streak, and whether a drop was both seen and recovered — come
 * first. It states what was observed and leaves the verdict to a person.
 */
export function formatFieldTestReport(summary: FieldTestSummary): string {
  const lines: string[] = []

  lines.push('INFORME DE CAMPO')
  lines.push('')
  lines.push(`Sesiones registradas: ${summary.totalSessions}`)
  lines.push(
    `Llegaron a preparado: ${summary.sessionsReachingReady} de ${summary.totalSessions}`
  )
  lines.push(`Racha seguida sin fallo: ${summary.longestReadyStreak}`)
  lines.push(
    `Caídas detectadas: ${summary.totalDrops} · recuperadas: ${summary.totalRecoveries}`
  )

  if (summary.totalDrops === 0) {
    lines.push('')
    lines.push(
      'Ninguna caída registrada. A2 no queda cerrada sin una: provócala'
      + ' antes de terminar.'
    )
  }

  lines.push('')
  lines.push('Por sesión:')

  for (const [index, session] of summary.sessions.entries()) {
    const parts: string[] = [
      session.reachedReady
        ? `preparado en ${session.msToReady === undefined ? '?' : seconds(session.msToReady)}`
        : 'NO llegó a preparado'
    ]

    if (session.errorPhases.length > 0) {
      parts.push(`errores: ${session.errorPhases.join(', ')}`)
    }

    if (session.dropsDetected > 0) {
      parts.push(
        `caídas ${session.dropsDetected}, intentos ${session.reconnectAttempts},`
        + ` recuperadas ${session.recoveries}`
      )

      if (session.recoveryMs.length > 0) {
        parts.push(`recuperación en ${session.recoveryMs.map(seconds).join(', ')}`)
      }

      parts.push(
        session.telemetryResumedAfterRecovery
          ? 'lecturas reanudadas'
          : 'LECTURAS NO REANUDADAS tras recuperar'
      )
    }

    if (session.telemetryReadings > 0) {
      parts.push(`${session.telemetryReadings} lecturas`)
    }

    lines.push(`${index + 1}. ${parts.join(' · ')}`)
  }

  return lines.join('\n')
}
