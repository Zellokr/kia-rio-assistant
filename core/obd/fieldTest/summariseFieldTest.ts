import type {
  PersistableObdSessionEvent
} from '../persistence/persistedEventAllowlist'

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
  /**
   * Whether anything was recorded for this session at all.
   *
   * A session with no events says nothing about the vehicle. Reporting it
   * as "did not reach ready" is a claim manufactured out of an absence, and
   * that is exactly what this summary did at the car on 2026-08-28 — the
   * session had simply not been written to storage yet.
   */
  readonly recorded: boolean
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
   * Whether telemetry started again AFTER the last recovery. The question
   * A2 exists to answer: a link that reconnects but never resumes polling
   * looks identical to a healthy one from the badge alone.
   *
   * `undefined` when it cannot be answered — no recovery happened, or
   * telemetry was never running in the first place, in which case there was
   * nothing to resume.
   *
   * Read from `telemetry-state` events, not from readings. Readings are
   * `decoded-value` with `source: 'telemetry'`, and `isPersistableEvent`
   * stores only the `manual` ones — so a summary built on them reported
   * "LECTURAS NO REANUDADAS" for every session ever recorded, including the
   * one on 2026-08-28 where the log plainly shows telemetry restarting 2.5
   * seconds after the reconnection. Narrowing this function's input to
   * `PersistableObdSessionEvent` is what makes that a compile error rather
   * than a confident false claim about a car.
   */
  readonly telemetryResumedAfterRecovery: boolean | undefined
  /** How many times telemetry was started during the session. */
  readonly telemetryRuns: number
}

export interface FieldTestSummary {
  readonly sessions: readonly FieldTestSessionSummary[]
  readonly totalSessions: number
  /** Sessions with no events at all — evidence of nothing, either way. */
  readonly sessionsWithoutData: number
  readonly sessionsReachingReady: number
  /**
   * The longest run of consecutive sessions that reached ready, counted
   * over sessions that recorded something. An unrecorded session neither
   * extends the run nor breaks it: both would be claims the data does not
   * support, so it is left out and counted separately instead.
   */
  readonly longestReadyStreak: number
  readonly totalDrops: number
  readonly totalRecoveries: number
}

function isActivity(
  event: PersistableObdSessionEvent,
  activity: string
): boolean {
  return event.type === 'activity' && event.activity === activity
}

export function summariseSession(
  sessionId: string,
  startedAt: string,
  events: readonly PersistableObdSessionEvent[]
): FieldTestSessionSummary {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence)

  const ready = ordered.find(
    event => event.type === 'session-state' && event.state === 'ready'
  )

  const errorPhases = ordered
    .filter(event => event.type === 'error')
    .map(event => event.error.phase)

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
  const telemetryStarts = ordered.filter(
    event => event.type === 'telemetry-state' && event.state === 'started'
  )
  const startedBeforeRecovery = lastRecovery !== undefined
    && telemetryStarts.some(event => event.sequence < lastRecovery.sequence)

  return {
    sessionId,
    startedAt,
    recorded: ordered.length > 0,
    msToReady: ready?.elapsedMs,
    reachedReady: ready !== undefined,
    errorPhases,
    dropsDetected: drops.length,
    reconnectAttempts: attempts.length,
    recoveries: recovered.length,
    recoveryMs,
    telemetryResumedAfterRecovery:
      lastRecovery === undefined || !startedBeforeRecovery
        ? undefined
        : telemetryStarts.some(
            event => event.sequence > lastRecovery.sequence
          ),
    telemetryRuns: telemetryStarts.length
  }
}

export function summariseFieldTest(
  sessions: readonly FieldTestSessionSummary[]
): FieldTestSummary {
  let streak = 0
  let longestReadyStreak = 0

  for (const session of sessions) {
    if (!session.recorded) {
      continue
    }

    streak = session.reachedReady ? streak + 1 : 0
    longestReadyStreak = Math.max(longestReadyStreak, streak)
  }

  return {
    sessions,
    totalSessions: sessions.length,
    sessionsWithoutData: sessions.filter(s => !s.recorded).length,
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
  const withData = summary.totalSessions - summary.sessionsWithoutData

  lines.push(`Sesiones registradas: ${summary.totalSessions}`)
  lines.push(
    `Llegaron a preparado: ${summary.sessionsReachingReady} de ${withData} con datos`
  )
  lines.push(`Racha seguida sin fallo: ${summary.longestReadyStreak}`)

  if (summary.sessionsWithoutData > 0) {
    lines.push(
      `Sin datos: ${summary.sessionsWithoutData}`
      + ' (no dicen nada del vehículo, ni a favor ni en contra)'
    )
  }
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
    if (!session.recorded) {
      lines.push(`${index + 1}. sin eventos registrados`)
      continue
    }

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

      if (session.telemetryResumedAfterRecovery !== undefined) {
        parts.push(
          session.telemetryResumedAfterRecovery
            ? 'lecturas reanudadas'
            : 'LECTURAS NO REANUDADAS tras recuperar'
        )
      }
    }

    if (session.telemetryRuns > 0) {
      parts.push(
        session.telemetryRuns === 1
          ? 'lecturas activadas'
          : `lecturas activadas ${session.telemetryRuns} veces`
      )
    }

    lines.push(`${index + 1}. ${parts.join(' · ')}`)
  }

  return lines.join('\n')
}
