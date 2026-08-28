import {
  computed,
  onScopeDispose,
  ref
} from 'vue'

import type {
  ObdSessionEvent,
  ObdSessionLog
} from '~~/core/obd/logging/ObdSessionLog'

/**
 * TEMPORARY — field-test evidence delivery. Defined by `vite.define` in
 * `nuxt.config.ts` and by `vitest.config.ts`; see `telegramFieldLog.ts`.
 */
declare const __FIELD_TEST_TELEGRAM__: boolean

function formatEvent(event: ObdSessionEvent): string {
  switch (event.type) {
    case 'command-queued':
      return `QUEUE → ${event.command}`
    case 'tx':
      return `TX → ${event.command}`
    case 'rx-chunk':
      return `RX CHUNK ← ${JSON.stringify(event.rawText)}`
    case 'rx-frame':
      return `RX FRAME ← ${event.normalizedText} (${event.responseKind}${event.latencyMs === undefined ? '' : `, ${event.latencyMs} ms`})`
    case 'decoded-value':
      if (event.decoded.kind === 'dtc') {
        return event.decoded.observations.length === 0
          ? 'DTC ← Sin códigos almacenados'
          : `DTC ← ${event.decoded.observations.map((observation) => {
            return `${observation.code} (${observation.state}, ${observation.type})`
          }).join(', ')}`
      }

      return `${event.source === 'telemetry' ? 'TELEMETRY' : 'VALUE'} ← ${event.decoded.label}: ${event.decoded.value} ${event.decoded.unit}`
    case 'capability-discovery':
      return `SUPPORTED PIDS ← ${event.pids.join(', ')}`
    case 'session-state':
      return `SESSION STATE ← ${event.state}`
    case 'telemetry-state':
      return `--- TELEMETRY ${event.state.toUpperCase()} ---`
    case 'error':
      return `ERROR [${event.error.phase}]${event.command ? ` ${event.command}` : ''}: ${event.error.message}`
    case 'activity': {
      const labels: Record<
        Extract<
          ObdSessionEvent,
          { type: 'activity' }
        >['activity'],
        string
      > = {
        'adapter-selected': 'Dispositivo seleccionado',
        'connected': 'Conectado',
        'disconnected': 'Desconectado',
        'initialization-started': '--- ELM327 INITIALIZATION START ---',
        'initialization-completed': '--- ELM327 READY ---',
        'discovery-started': '--- PID DISCOVERY START ---',
        'discovery-completed': '--- PID DISCOVERY END ---',
        'queue-test-started': '--- QUEUE TEST START ---',
        'queue-test-completed': '--- QUEUE TEST END ---',
        'reconnect-started': '--- RECONNECT START ---',
        'reconnect-attempt': '--- RECONNECT ATTEMPT ---',
        'reconnected': '--- RECONNECTED ---',
        'reconnect-failed': '--- RECONNECT FAILED ---'
      }

      return labels[event.activity]
    }
  }
}

export function useObdSessionLog(log: ObdSessionLog) {
  const initial = log.getExport()
  const events = ref<ObdSessionEvent[]>(initial.events)
  const endedAt = ref<string | null>(initial.endedAt)
  const droppedEvents = ref(
    initial.retention.droppedEvents
  )
  const hiddenThroughSequence = ref(0)

  const unsubscribe = log.subscribe((change) => {
    if (change.type === 'started') {
      events.value = []
      endedAt.value = null
      droppedEvents.value = 0
      hiddenThroughSequence.value = 0
      return
    }

    if (change.type === 'finished') {
      endedAt.value = change.endedAt
      return
    }

    const eventWasDropped
      = change.droppedEvents > droppedEvents.value

    events.value.push(change.event)

    if (eventWasDropped) {
      events.value.shift()
    }

    droppedEvents.value = change.droppedEvents
  })

  onScopeDispose(unsubscribe)

  const visibleEvents = computed(() => {
    return events.value.filter(
      event => event.sequence
        > hiddenThroughSequence.value
    )
  })

  const lines = computed(() => {
    return visibleEvents.value.map(formatEvent)
  })

  const truncated = computed(
    () => droppedEvents.value > 0
  )

  function clearDisplay(): void {
    hiddenThroughSequence.value
      = events.value.at(-1)?.sequence ?? 0
  }

  /**
   * Copies the session export to the clipboard, reporting whether it worked.
   *
   * This is the path that gets evidence off the phone, and the phone is
   * where every physical session is recorded. There used to be a download
   * button beside it, built on `<a download>` over a `blob:` URL — which the
   * Android WebView ignores. It was removed on 2026-08-28: a control that
   * looks like it works and silently does nothing is the same class of
   * defect as a frozen reading that looks live.
   *
   * So this reports failure rather than swallowing it. A driver who is told
   * the copy failed can try again; one who is told nothing walks away
   * believing the evidence was saved.
   */
  async function copyJson(): Promise<boolean> {
    const clipboard = globalThis.navigator?.clipboard

    if (!clipboard) {
      return false
    }

    try {
      await clipboard.writeText(
        JSON.stringify(log.getExport(), null, 2)
      )

      return true
    } catch {
      return false
    }
  }

  /**
   * TEMPORARY — field-test evidence delivery. Delete with
   * `app/services/telegramFieldLog.ts`.
   *
   * Whether this build carries a Telegram sender at all.
   *
   * `__FIELD_TEST_TELEGRAM__` is a build-time literal, so an ordinary build
   * folds every branch below to nothing: no `useRuntimeConfig` call, no
   * dynamic import, no sender chunk. The credentials cannot leak from a
   * build that does not contain them, and this composable keeps working
   * without a Nuxt app instance — which is what lets it be tested directly.
   *
   * Only the flag lives here; the sending itself is `sendFieldReport` in
   * `useObdSessionRecording`, which needs the persistence this composable
   * does not have.
   *
   * `scripts/assert-no-field-test-secrets.mjs` checks the fold against the
   * emitted bytes. It caught the first version of this, where the guard was
   * a runtime boolean: the chunk shipped anyway, merely unreachable.
   */
  const telegramEnabled = __FIELD_TEST_TELEGRAM__

  return {
    events,
    lines,
    endedAt,
    droppedEvents,
    truncated,
    clearDisplay,
    copyJson,
    telegramEnabled
  }
}
