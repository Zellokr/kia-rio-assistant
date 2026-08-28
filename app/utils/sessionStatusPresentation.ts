import type {
  ObdSessionState
} from '~~/core/obd/session/ObdSessionStateMachine'
import { assertNever } from '~/utils/assertNever'

export type SessionTone = 'neutral' | 'progress' | 'ready' | 'attention'

/**
 * The three phases a connection passes through, in order.
 *
 * Reaching ready took 7.5–9.8 seconds on the vehicle on 2026-08-28, almost
 * all of it in the first phase. Seven seconds of an unchanging "Conectando"
 * is long enough that a driver starts wondering whether it hung, so the
 * screen says which phase it is in rather than only that it is busy.
 */
export const CONNECTION_PHASES = [
  { key: 'connecting', label: 'Enlazar' },
  { key: 'initializing', label: 'Preparar' },
  { key: 'discovering', label: 'Consultar' }
] as const

export interface SessionStatus {
  readonly label: string
  /**
   * What the state means, not which colour to paint. Colour alone never
   * carries meaning here — every tone ships with an icon and a label, per
   * `color-not-decorative-only`.
   */
  readonly tone: SessionTone
  readonly icon: string
  /** Whether something is in flight, so the indicator can show it is alive. */
  readonly busy: boolean
  /**
   * How far through the connection sequence, 1-based, or `undefined` when
   * the session is not connecting.
   */
  readonly phase: number | undefined
  /** One line of what to expect, or what to do about it. */
  readonly detail: string
}

/**
 * How a session state reads on screen.
 *
 * Exhaustive over `ObdSessionState` with an `assertNever` fallthrough: a
 * state added to the machine is a build error here rather than a raw
 * identifier rendered at a driver.
 */
export function describeSessionStatus(state: ObdSessionState): SessionStatus {
  switch (state) {
    case 'idle':
      return {
        label: 'Sin conexión',
        tone: 'neutral',
        icon: 'i-lucide-plug',
        busy: false,
        phase: undefined,
        detail: 'Enchufa el adaptador y busca el tuyo.'
      }

    case 'disconnected':
      return {
        label: 'Desconectado',
        tone: 'neutral',
        icon: 'i-lucide-plug',
        busy: false,
        phase: undefined,
        detail: 'Ya no se está leyendo nada del coche.'
      }

    case 'selecting':
      return {
        label: 'Buscando adaptador',
        tone: 'progress',
        icon: 'i-lucide-bluetooth-searching',
        busy: true,
        phase: undefined,
        detail: 'Elige el VEEPEAK en la lista del móvil.'
      }

    case 'selected':
      return {
        label: 'Adaptador elegido',
        tone: 'progress',
        icon: 'i-lucide-bluetooth',
        busy: false,
        phase: undefined,
        detail: 'Listo para conectar.'
      }

    case 'connecting':
      return {
        label: 'Enlazando con el adaptador',
        tone: 'progress',
        icon: 'i-lucide-bluetooth',
        busy: true,
        phase: 1,
        detail: 'Suele tardar unos ocho segundos.'
      }

    case 'initializing':
      return {
        label: 'Preparando el adaptador',
        tone: 'progress',
        icon: 'i-lucide-settings-2',
        busy: true,
        phase: 2,
        detail: 'Configurando cómo hablar con el coche.'
      }

    case 'discovering':
      return {
        label: 'Preguntando al coche',
        tone: 'progress',
        icon: 'i-lucide-search',
        busy: true,
        phase: 3,
        detail: 'Averiguando qué lecturas admite.'
      }

    case 'ready':
      return {
        label: 'Conectado',
        tone: 'ready',
        icon: 'i-lucide-circle-check',
        busy: false,
        phase: undefined,
        detail: 'Ya puedes ver lecturas y leer averías.'
      }

    case 'reconnecting':
      return {
        label: 'Se perdió la conexión',
        tone: 'attention',
        icon: 'i-lucide-refresh-cw',
        busy: true,
        phase: undefined,
        detail: 'Reintentando solo. No hace falta que toques nada.'
      }

    case 'disconnecting':
      return {
        label: 'Desconectando',
        tone: 'progress',
        icon: 'i-lucide-unplug',
        busy: true,
        phase: undefined,
        detail: 'Cerrando la conexión con el adaptador.'
      }

    case 'error':
      return {
        label: 'No se pudo conectar',
        tone: 'attention',
        icon: 'i-lucide-triangle-alert',
        busy: false,
        phase: undefined,
        detail: 'Comprueba el adaptador y el contacto, y vuelve a intentarlo.'
      }

    default:
      return assertNever(state, 'ObdSessionState')
  }
}

/**
 * The badge colour for a tone, in Nuxt UI's semantic names.
 *
 * Separate from `tone` so the meaning and its rendering stay apart: the
 * state machine decides what is happening, this decides how it is painted.
 */
export function sessionToneColor(
  tone: SessionTone
): 'neutral' | 'warning' | 'success' | 'error' {
  switch (tone) {
    case 'neutral': return 'neutral'
    case 'progress': return 'warning'
    case 'ready': return 'success'
    case 'attention': return 'error'
    default: return assertNever(tone, 'SessionTone')
  }
}
