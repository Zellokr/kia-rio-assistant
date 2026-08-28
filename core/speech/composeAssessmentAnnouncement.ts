import type {
  DiagnosticAssessment
} from '../obd/diagnostics/assessDiagnostics'
import type { DiagnosticSeverity } from '../obd/diagnostics/ports'

/**
 * Turns a local assessment into the one short sentence worth saying aloud.
 *
 * RF-031 asks for TTS *breve*, and §11 forbids aggressive repetition. Both
 * rules point the same way: the useful output of this function is often
 * `null`. A voice that comments on everything is one the driver learns to
 * ignore before it ever says something that matters, so silence is a result
 * here, not a failure.
 *
 * What survives the cut is severity and the immediate action — the two things
 * a driver can act on without looking at the screen. Causes, evidence and
 * limitations stay on screen, where they can be read rather than remembered.
 *
 * §11 also asks for detailed answers while parked and short ones in motion.
 * That needs the driving mode, which this project does not have yet, so
 * everything here is the short form. Adding the long form is a later change
 * with a real trigger behind it, not a guess at one.
 */

export interface AnnouncementOptions {
  /**
   * The last thing said aloud. Repeating it verbatim is the "repetición
   * agresiva" §11 rules out, so an identical announcement is dropped.
   */
  readonly previous?: string | null
}

/**
 * Spanish, user-facing, spoken. `info` is absent on purpose: there is no
 * headline for it because it is never announced.
 */
const HEADLINE: Record<Exclude<DiagnosticSeverity, 'info'>, string> = {
  warning: 'Aviso',
  critical: 'Atención'
}

/**
 * The hedge for an unconfirmed finding, spoken.
 *
 * A critical alert keeps its comma so the alarm word lands first and the
 * caveat follows — the driver must react to "Atención" before parsing the
 * qualifier. A warning takes it inline, where there is no urgency to protect.
 */
const UNCONFIRMED: Record<Exclude<DiagnosticSeverity, 'info'>, string> = {
  warning: 'Aviso sin confirmar',
  critical: 'Atención, sin confirmar'
}

export function composeAssessmentAnnouncement(
  assessment: DiagnosticAssessment,
  options: AnnouncementOptions = {}
): string | null {
  if (assessment.severity === 'info') {
    return null
  }

  const headline = assessment.confidence === 'low'
    ? UNCONFIRMED[assessment.severity]
    : HEADLINE[assessment.severity]

  const action = assessment.immediateAction.trim()

  const spoken = action
    ? `${headline}. ${action}`
    : `${headline}.`

  return spoken === options.previous
    ? null
    : spoken
}
