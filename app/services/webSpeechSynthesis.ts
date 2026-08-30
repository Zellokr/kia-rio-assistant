import {
  detectSpeechCapability,
  type SpeechCapabilityHost
} from '~~/core/speech/detectSpeechCapability'
import type {
  SpeakHooks,
  SpeechSynthesisPort
} from '~~/core/speech/SpeechAnnouncer'

/**
 * Adapter from the Web Speech API to `SpeechSynthesisPort`.
 *
 * `speechSynthesis.speak()` is fire-and-forget: it returns nothing and reports
 * the outcome through events on the utterance. `SpeechAnnouncer` needs the
 * opposite — a promise that settles — because ADR-012 makes *speaking* the
 * proof that the engine works. This is where one becomes the other.
 *
 * The host is injected rather than read from `window`, so the failure paths
 * that matter here can be tested without a browser.
 */

export interface UtteranceLike {
  text: string
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
}

export interface WebSpeechHost extends SpeechCapabilityHost {
  readonly speechSynthesis?: {
    getVoices?: () => ReadonlyArray<{ lang?: string }>
    speak?: (utterance: UtteranceLike) => void
    cancel?: () => void
  }
  readonly SpeechSynthesisUtterance?: new (text: string) => UtteranceLike
}

export interface WebSpeechOptions {
  /**
   * How long to wait for the engine to report audio start.
   *
   * Android WebViews are known to drop `onend`, which would otherwise leave
   * this promise pending forever.
   *
   * The timeout only applies before `onstart`: an engine that never made a
   * sound has proven nothing, and ADR-012's whole point is not to claim a
   * working engine without evidence. Once `onstart` fires, this adapter resolves
   * immediately because the proof already happened. Generous by default so a
   * slow-but-working engine is not slandered.
   */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 8000

/** Spanish, user-facing: these reasons are shown on the toggle in the car. */
function absentMessage(host: WebSpeechHost): string {
  const report = detectSpeechCapability(host)

  return report.notes[0]
    ?? 'speechSynthesis no está disponible: el TTS necesitará un puente nativo de Capacitor.'
}

function failureMessage(host: WebSpeechHost, error?: string): string {
  const report = detectSpeechCapability(host)

  if (report.voiceCount === 0) {
    return `El motor de voz falló y no hay voces instaladas${error ? ` (${error})` : ''}. Instala un paquete de voz en español en los ajustes del sistema.`
  }

  return `El motor de voz falló${error ? `: ${error}` : '.'}`
}

export function createWebSpeechSynthesis(
  host: WebSpeechHost,
  options: WebSpeechOptions = {}
): SpeechSynthesisPort {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    speak(text: string, hooks?: SpeakHooks): Promise<void> {
      const synthesis = host.speechSynthesis
      const Utterance = host.SpeechSynthesisUtterance

      if (!synthesis?.speak || !Utterance) {
        return Promise.reject(new Error(absentMessage(host)))
      }

      // Bound here so the guard above still holds inside the executor.
      const speak = synthesis.speak.bind(synthesis)

      return new Promise<void>((resolve, reject) => {
        const utterance = new Utterance(text)

        utterance.lang = 'es-ES'

        const timer = setTimeout(() => {
          settle(() => reject(new Error(
            'El motor de voz no emitió ningún sonido. Se da por no funcional.'
          )))
        }, timeoutMs)

        function settle(finish: () => void): void {
          clearTimeout(timer)

          utterance.onstart = null
          utterance.onend = null
          utterance.onerror = null

          finish()
        }

        /**
         * The proof, and the moment the promise resolves. Reported before the
         * phrase finishes on purpose.
         */
        utterance.onstart = () => settle(() => {
          hooks?.onStart?.()
          resolve()
        })

        utterance.onend = () => undefined

        utterance.onerror = event => settle(() => reject(
          new Error(failureMessage(host, event?.error))
        ))

        speak(utterance)
      })
    },

    cancel(): void {
      host.speechSynthesis?.cancel?.()
    }
  }
}
