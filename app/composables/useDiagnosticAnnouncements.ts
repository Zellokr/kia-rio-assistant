import { watch, type Ref } from 'vue'

import {
  composeAssessmentAnnouncement
} from '~~/core/speech/composeAssessmentAnnouncement'
import type {
  DiagnosticAssessment
} from '~~/core/obd/diagnostics/assessDiagnostics'
import { useSpeechAnnouncer } from '~/composables/useSpeechAnnouncer'

/**
 * Speaks the local assessment when it changes.
 *
 * This is the seam between diagnostics and voice, and it is deliberately the
 * only one: nothing in `core/obd/` knows the app can talk, and the announcer
 * knows nothing about faults. What may be said is decided by
 * `composeAssessmentAnnouncement`; whether anything comes out is decided by
 * the toggle, which is off until the driver turns it on.
 *
 * The watcher only decides *when* to ask. Deciding what is worth saying — and
 * that an unchanged assessment is worth nothing — belongs to the composer,
 * which is pure and can be tested without a component.
 */

export type AnnounceFn = (text: string) => Promise<void>

/**
 * The testable core of the composable: same behaviour, with the speaker
 * injected so it can run without Nuxt.
 */
export function watchDiagnosticAnnouncements(
  assessment: Ref<DiagnosticAssessment | undefined>,
  announce: AnnounceFn
): void {
  let previous: string | null = null

  watch(assessment, (current) => {
    if (!current) {
      /**
       * The reads were cleared. Forgetting resets the repeat guard, so the
       * same fault read again later is announced again rather than swallowed
       * as a duplicate.
       */
      previous = null

      return
    }

    const spoken = composeAssessmentAnnouncement(current, { previous })

    if (!spoken) {
      return
    }

    previous = spoken

    /**
     * Fire and forget, failure included. A diagnostic must never fail because
     * the phone could not say it out loud.
     */
    void announce(spoken).catch(() => {})
  })
}

export function useDiagnosticAnnouncements(
  assessment: Ref<DiagnosticAssessment | undefined>
): void {
  const { announce } = useSpeechAnnouncer()

  watchDiagnosticAnnouncements(assessment, announce)
}
