import type {
  ObdErrorPhase,
  ObdSessionEvent
} from '~~/core/obd/logging/ObdSessionLog'

export type SessionLogFilter = 'all' | 'commands' | 'errors'
export type SessionEventTone
  = 'neutral' | 'primary' | 'success' | 'warning' | 'error'

export interface PresentedSessionEvent {
  id: number
  title: string
  summary: string
  meta: string
  rawText?: string
  normalizedText?: string
  tone: SessionEventTone
  icon: string
}

const phaseLabels: Record<ObdErrorPhase, string> = {
  'selection': 'Selección',
  'connection': 'Conexión',
  'transport-write': 'Envío',
  'parser': 'Parser',
  'response': 'Respuesta',
  'timeout': 'Tiempo de espera',
  'decode': 'Decodificación',
  'poll': 'Telemetría',
  'disconnect': 'Desconexión'
}

const stateLabels: Record<
  Extract<ObdSessionEvent, { type: 'session-state' }>['state'],
  string
> = {
  idle: 'Sin conexión',
  selecting: 'Seleccionando',
  selected: 'Seleccionado',
  connecting: 'Conectando',
  initializing: 'Inicializando ELM327',
  discovering: 'Descubriendo PIDs',
  ready: 'Preparado',
  disconnecting: 'Desconectando',
  disconnected: 'Desconectado',
  error: 'Error'
}

function elapsedLabel(elapsedMs: number): string {
  return elapsedMs < 1000
    ? `+${elapsedMs} ms`
    : `+${(elapsedMs / 1000).toFixed(1)} s`
}

function metadata(
  event: ObdSessionEvent,
  extra?: string
): string {
  return [elapsedLabel(event.elapsedMs), extra]
    .filter(Boolean)
    .join(' · ')
}

export function presentSessionEvent(
  event: ObdSessionEvent
): PresentedSessionEvent {
  switch (event.type) {
    case 'command-queued':
      return {
        id: event.sequence,
        title: `En cola · ${event.command}`,
        summary: 'Esperando su turno en el executor',
        meta: metadata(event),
        tone: 'neutral',
        icon: 'i-lucide-clock-3'
      }
    case 'tx':
      return {
        id: event.sequence,
        title: `Enviado · ${event.command}`,
        summary: event.normalizedText,
        meta: metadata(event),
        rawText: event.rawText,
        normalizedText: event.normalizedText,
        tone: 'primary',
        icon: 'i-lucide-arrow-up-right'
      }
    case 'rx-chunk':
      return {
        id: event.sequence,
        title: event.command
          ? `Fragmento · ${event.command}`
          : 'Fragmento recibido',
        summary: event.rawText.replace(/[\r\n]+/g, ' ↵ '),
        meta: metadata(event),
        rawText: event.rawText,
        tone: 'neutral',
        icon: 'i-lucide-brackets'
      }
    case 'rx-frame':
      return {
        id: event.sequence,
        title: event.command
          ? `Respuesta · ${event.command}`
          : 'Respuesta recibida',
        summary: event.normalizedText || event.responseKind,
        meta: metadata(
          event,
          [
            event.responseKind,
            event.latencyMs === undefined
              ? undefined
              : `${event.latencyMs} ms`
          ].filter(Boolean).join(' · ')
        ),
        rawText: event.rawText,
        normalizedText: event.normalizedText,
        tone: event.responseKind === 'obd-data'
          ? 'success'
          : event.responseKind === 'no-data'
            ? 'warning'
            : 'neutral',
        icon: 'i-lucide-arrow-down-left'
      }
    case 'decoded-value': {
      const summary = event.decoded.kind === 'dtc'
        ? event.decoded.dtcs.length
          ? event.decoded.dtcs.join(', ')
          : 'Sin códigos almacenados'
        : `${event.decoded.label}: ${event.decoded.value} ${event.decoded.unit}`

      return {
        id: event.sequence,
        title: event.decoded.kind === 'dtc'
          ? 'DTC decodificados'
          : `Valor · ${event.command}`,
        summary,
        meta: metadata(event, `${event.latencyMs} ms`),
        tone: 'success',
        icon: event.decoded.kind === 'dtc'
          ? 'i-lucide-scan-search'
          : 'i-lucide-gauge'
      }
    }
    case 'capability-discovery':
      return {
        id: event.sequence,
        title: 'PIDs compatibles',
        summary: event.pids.length
          ? event.pids.join(', ')
          : 'No se descubrieron PIDs',
        meta: metadata(event, event.command),
        tone: 'success',
        icon: 'i-lucide-list-checks'
      }
    case 'session-state':
      return {
        id: event.sequence,
        title: 'Estado de sesión',
        summary: stateLabels[event.state],
        meta: metadata(event),
        tone: event.state === 'error'
          ? 'error'
          : event.state === 'ready'
            ? 'success'
            : 'neutral',
        icon: 'i-lucide-radio'
      }
    case 'telemetry-state':
      return {
        id: event.sequence,
        title: 'Telemetría',
        summary: event.state === 'started' ? 'Iniciada' : 'Detenida',
        meta: metadata(event),
        tone: event.state === 'started' ? 'success' : 'neutral',
        icon: 'i-lucide-activity'
      }
    case 'error':
      return {
        id: event.sequence,
        title: `Error · ${phaseLabels[event.error.phase]}`,
        summary: event.error.message,
        meta: metadata(event, event.command),
        rawText: event.rawText,
        normalizedText: event.normalizedText,
        tone: 'error',
        icon: 'i-lucide-circle-alert'
      }
    case 'activity': {
      const labels: Record<typeof event.activity, string> = {
        'adapter-selected': 'Adaptador seleccionado',
        'connected': 'Transporte conectado',
        'disconnected': 'Transporte desconectado',
        'initialization-started': 'Inicialización ELM327 iniciada',
        'initialization-completed': 'ELM327 preparado',
        'discovery-started': 'Descubrimiento de PIDs iniciado',
        'discovery-completed': 'Descubrimiento de PIDs completado',
        'queue-test-started': 'Prueba de cola iniciada',
        'queue-test-completed': 'Prueba de cola completada'
      }

      return {
        id: event.sequence,
        title: 'Actividad',
        summary: labels[event.activity],
        meta: metadata(event),
        tone: event.activity === 'connected'
          || event.activity === 'initialization-completed'
          || event.activity === 'discovery-completed'
          || event.activity === 'queue-test-completed'
          ? 'success'
          : 'neutral',
        icon: 'i-lucide-info'
      }
    }
  }
}

export function filterSessionEvents(
  events: ObdSessionEvent[],
  filter: SessionLogFilter
): ObdSessionEvent[] {
  if (filter === 'all') return events
  if (filter === 'errors') {
    return events.filter(event => event.type === 'error')
  }

  return events.filter((event) => {
    return event.type === 'command-queued'
      || event.type === 'tx'
      || event.type === 'rx-chunk'
      || event.type === 'rx-frame'
      || event.type === 'decoded-value'
      || (event.type === 'error' && Boolean(event.command))
  })
}
