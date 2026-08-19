import {
  computed,
  onScopeDispose,
  ref
} from 'vue'

import type {
  ObdSessionEvent,
  ObdSessionExport,
  ObdSessionLog
} from '~~/core/obd/logging/ObdSessionLog'

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
        return event.decoded.dtcs.length === 0
          ? 'DTC ← Sin códigos almacenados'
          : `DTC ← ${event.decoded.dtcs.join(', ')}`
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
        'queue-test-completed': '--- QUEUE TEST END ---'
      }

      return labels[event.activity]
    }
  }
}

function createFilename(session: ObdSessionExport): string {
  const timestamp = session.startedAt
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  return `obd-session-${timestamp}.json`
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

  function downloadJson(): void {
    if (typeof document === 'undefined') {
      return
    }

    const session = log.getExport()
    const blob = new Blob(
      [JSON.stringify(session, null, 2)],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = createFilename(session)
    anchor.click()

    // Revoke on the next macrotask, not synchronously: a large session export
    // may still be streaming to disk when click() returns, and revoking the
    // object URL immediately can truncate or cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return {
    events,
    lines,
    endedAt,
    droppedEvents,
    truncated,
    clearDisplay,
    downloadJson
  }
}
