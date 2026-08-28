import type {
  ObdSessionExport
} from '~~/core/obd/logging/ObdSessionLog'

/**
 * TEMPORARY — field-test evidence delivery. Delete this file to remove it.
 *
 * Why it exists: `downloadJson` does nothing in the Android WebView, which
 * ignores `<a download>` on a blob: URL, so the phone is the one place a
 * session cannot be saved from. Copying hundreds of kilobytes of JSON by
 * hand next to a running engine is not a plan. This posts the export to a
 * Telegram chat instead.
 *
 * ## This is gated OUT of ordinary builds, not merely hidden inside them
 *
 * `AGENTS.MD` rule: "No incluir secretos en el cliente." A bot token in a
 * shipped APK is exactly that, and unzipping an APK to grep its bundle is
 * two commands. So the token never reaches a normal build: `nuxt.config.ts`
 * only puts it in `runtimeConfig.public` when `FIELD_TEST_TELEGRAM=1` is set
 * at build time, and the caller imports this module dynamically behind the
 * same flag. Without the flag there is no token and no import — the code is
 * absent from the bundle rather than unreachable within it.
 *
 * Same shape as `shouldUseDevMockTransport`, and for the same reason: a
 * capability this project must not ship is removed by the build, not by
 * remembering to keep it switched off.
 *
 * ## What leaves the device
 *
 * The whole session export: timestamps, the Bluetooth adapter's name, the
 * supported-PID map, and every trouble code read from the car. No VIN —
 * `PHYSICAL_ALLOWED_COMMANDS` has no Mode 09, so the app cannot read one.
 * It goes to Telegram's servers. That is a deliberate trade for the field
 * test and the reason this is temporary.
 *
 * ## Removing it
 *
 * Delete this file, its test, the `telegram` block in `nuxt.config.ts`, and
 * the `telegramEnabled` flag in `useObdSessionLog` together with
 * `sendFieldReport` in `useObdSessionRecording`. Nothing else refers to it. `test/unit/telegramFieldLog.test.ts` asserts the production bundle
 * stays clean while it is here.
 */

export interface TelegramFieldLogConfig {
  readonly botToken: string
  readonly chatId: string
}

export type TelegramSendResult
  = | { ok: true }
    | { ok: false, reason: string }

/**
 * Posts the field report as a message, ahead of the files it summarises.
 *
 * The report is what replaces the notebook: every observation the procedure
 * asks a human to write down is already in the event log, and transcribing
 * timings by hand next to a running engine is the least reliable instrument
 * in the whole test.
 */
export async function sendReportToTelegram(
  report: string,
  config: TelegramFieldLogConfig,
  fetchImpl: typeof fetch = fetch
): Promise<TelegramSendResult> {
  if (!config.botToken || !config.chatId) {
    return {
      ok: false,
      reason: 'Falta el token o el chat de Telegram en esta compilación.'
    }
  }

  try {
    const response = await fetchImpl(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Telegram caps a message at 4096 characters. A long run is
        // truncated with a marker rather than rejected whole: the numbers
        // that decide whether to stop are at the top, and the JSON files
        // carry everything regardless.
        body: JSON.stringify({
          chat_id: config.chatId,
          text: report.length > 4000
            ? `${report.slice(0, 3960)}\n\n[informe recortado — ver ficheros]`
            : report
        })
      }
    )

    if (!response.ok) {
      return {
        ok: false,
        reason: `Telegram respondió ${response.status} al enviar el informe.`
      }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error
        ? `${error.message}. El registro sigue en el móvil.`
        : 'No se pudo enviar el informe. El registro sigue en el móvil.'
    }
  }
}

/**
 * The upload never becomes the only copy of a session.
 *
 * A garage has no signal, and losing a thirty-minute run because a POST
 * failed would be the worst failure this tool could have. The session stays
 * in the log and in IndexedDB either way; this reports what happened and
 * leaves recovery to the caller.
 */
export async function sendSessionToTelegram(
  session: ObdSessionExport,
  config: TelegramFieldLogConfig,
  fetchImpl: typeof fetch = fetch
): Promise<TelegramSendResult> {
  if (!config.botToken || !config.chatId) {
    return {
      ok: false,
      reason: 'Falta el token o el chat de Telegram en esta compilación.'
    }
  }

  const filename = `${session.sessionId}.json`
  const body = new FormData()

  body.append('chat_id', config.chatId)
  body.append(
    'caption',
    [
      `Sesión ${session.sessionId}`,
      `Inicio ${session.startedAt}`,
      `Eventos ${session.events.length}`,
      session.retention.complete
        ? 'Registro completo'
        : `Registro truncado, ${session.retention.droppedEvents} descartados`
    ].join('\n')
  )
  body.append(
    'document',
    new Blob([JSON.stringify(session, null, 2)], {
      type: 'application/json'
    }),
    filename
  )

  try {
    const response = await fetchImpl(
      `https://api.telegram.org/bot${config.botToken}/sendDocument`,
      { method: 'POST', body }
    )

    if (!response.ok) {
      return {
        ok: false,
        reason: `Telegram respondió ${response.status}. El registro sigue en el móvil.`
      }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error
        ? `${error.message}. El registro sigue en el móvil.`
        : 'No se pudo enviar. El registro sigue en el móvil.'
    }
  }
}
