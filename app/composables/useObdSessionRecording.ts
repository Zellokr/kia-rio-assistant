import { onScopeDispose } from 'vue'

import type { DtcObservation } from '~~/core/obd/dtc/DtcCode'
import type {
  ObdActivityEvent,
  ObdErrorPhase,
  ObdSessionLog
} from '~~/core/obd/logging/ObdSessionLog'
import {
  BufferedObdSessionRecorder
} from '~~/core/obd/persistence/BufferedObdSessionRecorder'
import type { ObdPersistence } from '~~/data/repositories/createObdPersistence'
import { useObdSessionLog } from '~/composables/useObdSessionLog'

/**
 * TEMPORARY — field-test evidence delivery. Defined by `vite.define` in
 * `nuxt.config.ts` and by `vitest.config.ts`; see
 * `docs/FIELD_TEST_TELEGRAM.md`.
 */
declare const __FIELD_TEST_TELEGRAM__: boolean

/**
 * Everything that writes the session down: the log the driver exports, and
 * the store it is mirrored into.
 *
 * It is a sink. Nothing here reaches back into the adapter, the executor or
 * the session state machine — which is why it is the one piece of the lab
 * session that can be lifted out whole. Every other part depends on it, and
 * it depends on none of them.
 *
 * Persistence is optional throughout. On a platform where the client plugin
 * never ran there is no `$obdPersistence`, and the session has to work
 * anyway; the log is the part that always exists.
 */
export function useObdSessionRecording(sessionLog: ObdSessionLog) {
  const persistence = import.meta.client
    ? (useNuxtApp() as { $obdPersistence?: ObdPersistence }).$obdPersistence
    : undefined

  let recorder: BufferedObdSessionRecorder | undefined
  let reconnectCount = 0

  const {
    events,
    droppedEvents,
    truncated,
    clearDisplay,
    downloadJson,
    copyJson,
    telegramEnabled
  } = useObdSessionLog(sessionLog)

  /**
   * TEMPORARY — field-test evidence delivery. Delete with
   * `app/services/telegramFieldLog.ts`; see `docs/FIELD_TEST_TELEGRAM.md`.
   *
   * Reads every stored session, not the live one. `sessionLog.start()`
   * resets the log and `selectDevice()` calls it on each attempt, so after
   * ten cycles the live log holds only the tenth — sending it would claim
   * to be evidence for ten while carrying one.
   */
  async function sendFieldReport(): Promise<string> {
    if (!__FIELD_TEST_TELEGRAM__) {
      return 'Esta compilación no lleva envío a Telegram.'
    }

    if (!persistence) {
      return 'No hay almacenamiento en este dispositivo; no se puede componer el informe.'
    }

    const config = useRuntimeConfig().public.telegram as {
      botToken: string
      chatId: string
    }

    const { sendFieldTestReport } = await import(
      '~/services/sendFieldTestReport'
    )

    const result = await sendFieldTestReport(persistence, config)

    if (result.problems.length > 0) {
      return `Enviadas ${result.sessionsSent} de ${result.sessionsFound}.`
        + ` ${result.problems[0]}`
    }

    return `Informe enviado con ${result.sessionsSent} sesiones.`
  }

  function toError(error: unknown): Error {
    return error instanceof Error
      ? error
      : new Error(String(error))
  }

  function recordError(
    error: unknown,
    phase: ObdErrorPhase,
    command?: string
  ): void {
    const normalizedError = toError(error)

    sessionLog.record({
      type: 'error',
      command,
      error: {
        name: normalizedError.name,
        message: normalizedError.message,
        phase
      }
    })
  }

  function recordActivity(activity: ObdActivityEvent['activity']): void {
    sessionLog.record({ type: 'activity', activity })
  }

  /**
   * Persistence is a recording of the session, never a participant in it: a
   * failed write must not interrupt a driver mid-read, so this swallows the
   * rejection.
   *
   * It still goes into the session log. The exported log is the evidence
   * artefact this project argues from, and a failed write that only ever
   * reached `console.warn` left a hole in that artefact which nobody
   * reading it afterwards could see — including the reader deciding whether
   * a missing observation means the vehicle stayed quiet or the write
   * failed.
   *
   * The report itself is not persisted; see `isPersistableEvent`.
   */
  function recordPersistenceError(error: unknown): void {
    recordError(error, 'persistence')
  }

  function persist(operation: Promise<void>): void {
    void operation.catch(recordPersistenceError)
  }

  function persistedSession() {
    const exported = sessionLog.getExport()

    return {
      schemaVersion: 1 as const,
      sessionId: exported.sessionId,
      startedAt: exported.startedAt,
      endedAt: exported.endedAt,
      transport: exported.transport,
      reconnectCount,
      truncated: false
    }
  }

  const unsubscribe = sessionLog.subscribe((change) => {
    if (!persistence) return

    if (change.type === 'started') {
      recorder?.finish()
      reconnectCount = 0
      recorder = new BufferedObdSessionRecorder(
        change.session.sessionId,
        persistence,
        { onError: recordPersistenceError }
      )
      persist(persistence.startSession(persistedSession()))
    } else if (change.type === 'event-recorded') {
      recorder?.record(change.event)

      if (
        change.event.type === 'activity'
        && change.event.activity === 'reconnected'
      ) {
        reconnectCount++
        persist(persistence.updateSession(persistedSession()))
      }
    } else if (change.type === 'finished') {
      recorder?.finish()
      persist(persistence.updateSession(persistedSession()))
    }
  })

  /**
   * Persists trouble codes the vehicle reported once.
   *
   * Shared by the driver-facing read and the manual `03` command so the two
   * paths cannot drift into writing different rows for the same observation.
   */
  function persistObservations(
    observations: readonly DtcObservation[]
  ): void {
    if (!persistence || observations.length === 0) {
      return
    }

    const sessionId = sessionLog.getExport().sessionId
    const writtenAt = Date.now()

    persist(persistence.recordObservations(
      observations.map((observation, index) => ({
        schemaVersion: 2 as const,
        id: `${sessionId}:${observation.code}:${writtenAt}:${index}`,
        sessionId,
        code: observation.code,
        type: observation.type,
        state: observation.state,
        observedAt: observation.observedAt
      }))
    ))
  }

  onScopeDispose(unsubscribe)

  return {
    /**
     * The store, exposed because supported-PID discovery caches its result
     * there. It is the one place a caller legitimately needs the adapter
     * rather than the recording helpers around it.
     */
    persistence,

    events,
    droppedEvents,
    truncated,
    clearDisplay,
    downloadJson,
    copyJson,

    /** TEMPORARY — field-test evidence delivery. See `telegramFieldLog.ts`. */
    telegramEnabled,
    sendFieldReport,

    toError,
    recordError,
    recordActivity,
    recordPersistenceError,
    persistObservations
  }
}
