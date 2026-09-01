import { watch, type Ref } from 'vue'

import type {
  DiagnosticAssessment
} from '~~/core/obd/diagnostics/assessDiagnostics'

/**
 * Stores the evaluation the driver was actually shown (RF-034).
 *
 * Modelled on `watchDiagnosticAnnouncements`, and for the same reason: the
 * watcher decides only *when* to act, the decision is testable without a
 * component, and nothing in `core/obd/` learns that a store exists.
 *
 * The guard is what keeps the store honest. `assessment` is a computed over
 * the session's reads, so it re-evaluates whenever a read lands — including
 * when the conclusion is unchanged. Writing a row per recompute would fill
 * the history with the same finding and make "what did this car tell me over
 * time" unreadable. Comparing the serialised value is enough here because a
 * `DiagnosticAssessment` is plain data the rules engine builds in a fixed
 * field order.
 *
 * Clearing the reads resets the guard: a new diagnostic session that finds
 * the same fault is a new observation, not a duplicate.
 */

export type RecordAssessmentFn = (assessment: DiagnosticAssessment) => void

export function watchAssessmentPersistence(
  assessment: Ref<DiagnosticAssessment | undefined>,
  record: RecordAssessmentFn
): void {
  let previous: string | null = null

  watch(assessment, (current) => {
    if (!current) {
      previous = null

      return
    }

    const serialised = JSON.stringify(current)

    if (serialised === previous) {
      return
    }

    previous = serialised

    try {
      record(current)
    } catch {
      // A diagnostic must never fail because the store could not keep it.
      // The write path reports its own failures into the session log.
    }
  })
}
