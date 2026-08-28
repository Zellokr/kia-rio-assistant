import {
  formatFieldTestReport,
  summariseFieldTest,
  summariseSession
} from '~~/core/obd/fieldTest/summariseFieldTest'
import type { ObdPersistence } from '~~/data/repositories/createObdPersistence'
import {
  sendReportToTelegram,
  sendSessionToTelegram
} from '~/services/telegramFieldLog'
import type { TelegramFieldLogConfig } from '~/services/telegramFieldLog'

/**
 * TEMPORARY — field-test evidence delivery. Delete with
 * `app/services/telegramFieldLog.ts`; see `docs/FIELD_TEST_TELEGRAM.md`.
 *
 * Sends every recorded session, and the report that reads them.
 *
 * ## Why it reads storage rather than the live log
 *
 * `sessionLog.start()` resets the log, and `selectDevice()` calls it on
 * every connection attempt. So after ten connect/disconnect cycles the live
 * log holds the tenth and nothing else — exporting it would send one
 * connection while claiming to be evidence for ten. That is the shape of
 * failure this project exists to avoid, so the ten sessions are read back
 * from IndexedDB, where each one was written as it happened.
 *
 * ## Why one report, not ten captions
 *
 * Every observation the procedure asks a human to write down is already in
 * the events. Transcribing timings into a notebook next to a running engine
 * is the least reliable instrument in the whole test, and the one nobody
 * can check afterwards.
 */

export interface FieldTestReportResult {
  readonly sessionsFound: number
  readonly sessionsSent: number
  readonly reportSent: boolean
  readonly problems: readonly string[]
}

export async function sendFieldTestReport(
  persistence: ObdPersistence,
  config: TelegramFieldLogConfig
): Promise<FieldTestReportResult> {
  const problems: string[] = []

  const records = await persistence.listSessions()
  const ordered = [...records].sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt)
  )

  if (ordered.length === 0) {
    return {
      sessionsFound: 0,
      sessionsSent: 0,
      reportSent: false,
      problems: ['No hay ninguna sesión guardada todavía.']
    }
  }

  const summaries = []
  const loaded = []

  for (const record of ordered) {
    const stored = await persistence.loadSession(record.sessionId)

    if (!stored) {
      problems.push(`No se pudo leer la sesión ${record.sessionId}.`)
      continue
    }

    // No cast: `entry.event` is already the persistable subset, and
    // widening it to `ObdSessionEvent` is what let the summary look for
    // telemetry readings that storage never holds.
    const events = stored.events.map(entry => entry.event)

    summaries.push(
      summariseSession(record.sessionId, record.startedAt, events)
    )
    loaded.push({ record, events })
  }

  /**
   * The report goes first. If the connection dies halfway through the
   * uploads, the numbers that decide whether to keep testing have already
   * arrived; the files are the detail behind them.
   */
  const report = formatFieldTestReport(summariseFieldTest(summaries))
  const reportResult = await sendReportToTelegram(report, config)

  if (!reportResult.ok) {
    problems.push(reportResult.reason)
  }

  let sessionsSent = 0

  for (const { record, events } of loaded) {
    const result = await sendSessionToTelegram(
      {
        schemaVersion: 1,
        sessionId: record.sessionId,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        transport: record.transport,
        retention: {
          maxEvents: events.length,
          droppedEvents: 0,
          complete: !record.truncated
        },
        events
      },
      config
    )

    if (result.ok) {
      sessionsSent++
    } else {
      problems.push(`${record.sessionId}: ${result.reason}`)
    }
  }

  return {
    sessionsFound: ordered.length,
    sessionsSent,
    reportSent: reportResult.ok,
    problems
  }
}
