import { onMounted, ref } from 'vue'

import {
  detectSpeechCapability,
  type SpeechCapabilityReport
} from '~~/core/speech/detectSpeechCapability'

/**
 * Runs the Web Speech reachability probe against the live `window`.
 *
 * The probe itself is pure and injected (`detectSpeechCapability` never reads
 * a global); this is the one place that hands it the real host, the same
 * arrangement `useSpeechAnnouncer` uses. It runs in `onMounted` so the read
 * never happens during `nuxt generate`, where there is no `window` and a
 * prerendered answer would describe the build machine rather than the phone.
 *
 * `probe` is exposed because `getVoices()` can return an empty list before
 * the engine finishes loading them — the probe says so in its own notes. A
 * manual re-check is offered instead of a `voiceschanged` listener: the
 * listener only exists on hosts that have `speechSynthesis` at all, which is
 * exactly the case this panel was added to investigate.
 */
export function useSpeechCapability() {
  const report = ref<SpeechCapabilityReport | null>(null)

  function probe(): void {
    report.value = detectSpeechCapability(window as never)
  }

  onMounted(probe)

  return { report, probe }
}
