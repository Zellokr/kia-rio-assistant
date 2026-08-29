import type {
  RecognitionHooks,
  SpeechRecognitionPort
} from '~~/core/speech/SpeechListener'

/**
 * Adapter from the Web Speech recognition API to `SpeechRecognitionPort`.
 *
 * The mirror image of `webSpeechSynthesis`: an event-driven browser object
 * becomes a promise that settles, so `SpeechListener` can treat starting the
 * microphone as something that either happens or fails with a reason.
 *
 * It exists to answer one question that check 6 left open. The
 * `SpeechRecognition` constructor is present in this WebView — unprefixed,
 * while `speechSynthesis` is absent — and a constructor is not a recognizer.
 * Only a real `start()` separates a working engine from one that throws, is
 * denied the microphone, or has no service behind it.
 *
 * The host is injected rather than read from `window`, so every failure path
 * here is tested without a browser.
 */

export interface RecognitionResultEvent {
  readonly results: ArrayLike<
    ArrayLike<{ transcript?: string }> & { isFinal?: boolean }
  >
}

export interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onstart: (() => void) | null
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export interface WebSpeechRecognitionHost {
  readonly SpeechRecognition?: new () => RecognitionLike
  readonly webkitSpeechRecognition?: new () => RecognitionLike
}

export interface WebSpeechRecognitionOptions {
  /**
   * How long to wait for the engine to take the microphone.
   *
   * Generous, because this window can hold an Android runtime permission
   * dialog: Capacitor's `BridgeWebChromeClient.onPermissionRequest` launches
   * a `RECORD_AUDIO` request, and the user has to answer it before any audio
   * can start. Too short a deadline would report a permission prompt as a
   * broken engine.
   */
  startTimeoutMs?: number
}

const DEFAULT_START_TIMEOUT_MS = 15000

/** Spanish, user-facing: shown on the probe panel, on the phone. */
const ABSENT_MESSAGE
  = 'No hay constructor de SpeechRecognition en este WebView: el STT '
    + 'necesitará un puente nativo de Capacitor.'

const NEVER_STARTED_MESSAGE
  = 'El reconocedor no llegó a abrir el micrófono. Se da por no funcional.'

export function createWebSpeechRecognition(
  host: WebSpeechRecognitionHost,
  options: WebSpeechRecognitionOptions = {}
): SpeechRecognitionPort {
  const startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS

  let live: RecognitionLike | null = null

  return {
    start(hooks?: RecognitionHooks): Promise<void> {
      const Recognition = host.SpeechRecognition
        ?? host.webkitSpeechRecognition

      if (!Recognition) {
        return Promise.reject(new Error(ABSENT_MESSAGE))
      }

      const recognition = new Recognition()

      live = recognition

      recognition.lang = 'es-ES'
      recognition.interimResults = true
      // One utterance per press. Push-to-talk is a button, not an open mic.
      recognition.continuous = false

      return new Promise<void>((resolve, reject) => {
        let settled = false
        let started = false

        const timer = setTimeout(
          () => settle(() => reject(new Error(NEVER_STARTED_MESSAGE))),
          startTimeoutMs
        )

        /**
         * `onerror` is followed by `onend`, so without this the second one
         * would resolve a promise the first already rejected.
         */
        function settle(finish: () => void): void {
          if (settled) {
            return
          }

          settled = true

          clearTimeout(timer)

          recognition.onstart = null
          recognition.onresult = null
          recognition.onerror = null
          recognition.onend = null

          if (live === recognition) {
            live = null
          }

          finish()
        }

        recognition.onstart = () => {
          started = true

          clearTimeout(timer)

          hooks?.onStart?.()
        }

        recognition.onresult = (event) => {
          const transcript = latestTranscript(event)

          if (transcript) {
            hooks?.onTranscript?.(transcript.text, transcript.isFinal)
          }
        }

        /** The code is the finding. It is never paraphrased. */
        recognition.onerror = event => settle(
          () => reject(new Error(event?.error ?? 'error-desconocido'))
        )

        recognition.onend = () => settle(() => {
          if (started) {
            resolve()

            return
          }

          reject(new Error(NEVER_STARTED_MESSAGE))
        })

        recognition.start()
      })
    },

    stop(): void {
      live?.stop()
    }
  }
}

/**
 * The last result the engine reported. Recognition emits a growing list and
 * re-sends earlier entries, so reading the tail is what shows the current
 * utterance rather than the first guess at it.
 */
function latestTranscript(
  event: RecognitionResultEvent
): { text: string, isFinal: boolean } | null {
  const results = event.results

  if (!results || results.length === 0) {
    return null
  }

  const last = results[results.length - 1]
  const text = last?.[0]?.transcript?.trim() ?? ''

  return text.length > 0
    ? { text, isFinal: last?.isFinal ?? false }
    : null
}
