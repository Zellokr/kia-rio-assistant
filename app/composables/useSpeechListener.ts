import { ref } from 'vue'

import { createWebSpeechRecognition } from '~/services/webSpeechRecognition'
import { SpeechListener } from '~~/core/speech/SpeechListener'
import type { ListenerState } from '~~/core/speech/SpeechListener'

/**
 * Wires the push-to-talk probe to the live Web Speech recognizer.
 *
 * The listener is built on the first press rather than on setup, so `window`
 * is only read once a person has actually asked for the microphone. That also
 * keeps `nuxt generate` away from it: there is no `window` at build time, and
 * a prerendered recognizer would describe nothing.
 *
 * State is mirrored into refs through the listener's own `onChange`, the same
 * arrangement `useSpeechAnnouncer` uses. Reading the class's getters directly
 * from a template would not be reactive.
 */
export function useSpeechListener() {
  const state = ref<ListenerState>('idle')
  const transcript = ref('')
  const transcriptIsFinal = ref(false)
  const reason = ref<string | null>(null)

  let listener: SpeechListener | null = null

  function resolveListener(): SpeechListener {
    if (listener) {
      return listener
    }

    const instance: SpeechListener = new SpeechListener(
      createWebSpeechRecognition(window as never),
      () => {
        state.value = instance.state
        transcript.value = instance.transcript
        transcriptIsFinal.value = instance.transcriptIsFinal
        reason.value = instance.unavailableReason
      }
    )

    listener = instance

    return listener
  }

  /** `listen` never rejects, so nothing here needs a catch. */
  function press(): void {
    void resolveListener().listen()
  }

  /**
   * Releasing before anything was ever pressed is a no-op rather than a
   * reason to construct a recognizer.
   */
  function release(): void {
    listener?.stop()
  }

  return {
    state,
    transcript,
    transcriptIsFinal,
    reason,
    press,
    release
  }
}
