import type {
  DiagnosticAssessment
} from '../obd/diagnostics/assessDiagnostics'
import type { DiagnosticSeverity } from '../obd/diagnostics/ports'

/**
 * Writes the on-screen answer from the local assessment alone.
 *
 * §9.1 requires the local engine to "generar una respuesta mediante
 * plantilla aunque no haya IA", and RF-033 is accepted only if "un error
 * externo no impide responder". This is that template. It is the reason a
 * provider outage degrades the answer instead of removing it (§9.5), and it
 * is also what a rejected AI response falls back to — see
 * `resolveAssistantAnswer`.
 *
 * The wording is §9's FORMATO DE RESPUESTA and its order is the contract,
 * not a layout preference. Every line comes from a field the rules engine
 * computed: this function selects, labels and orders, and it never adds a
 * claim of its own. That is what makes it safe to show when the AI is gone —
 * there is nothing here that could be wrong that was not already wrong
 * upstream.
 *
 * **One part of §9's format is missing: "sistema relacionado".**
 * `DiagnosticAssessment` is §8.2's eight fields and a ninth is ruled out;
 * the subsystem lives on `DtcCatalogEntry`, which the assessment does not
 * carry. Naming the gap beats inferring a system from a code prefix, which
 * is exactly the kind of plausible invention §9.4 forbids the AI and this
 * project does not grant itself either.
 *
 * The spoken form is not here. `composeAssessmentAnnouncement` produces the
 * one or two sentences §9 allows while driving; this is the detail that
 * "queda en pantalla".
 */

/** §9.2's own names for the three levels. User-facing, do not paraphrase. */
const SEVERITY_LABELS: Record<DiagnosticSeverity, string> = {
  info: 'Información',
  warning: 'Advertencia',
  critical: 'Crítica'
}

export function composeLocalAnswer(
  assessment: DiagnosticAssessment
): string {
  const sections: string[] = [
    `Códigos detectados: ${
      assessment.dtcs.length > 0
        ? assessment.dtcs.join(', ')
        : 'ninguno'
    }`,
    `Gravedad: ${describeSeverity(assessment)}`
  ]

  appendList(sections, 'Evidencias', assessment.evidence.map(
    item => item.description
  ))

  appendList(sections, 'Causas posibles', assessment.possibleCauses)

  // Always present: the engine produces a conservative action for every
  // severity, so the driver is never left without an instruction.
  sections.push(`Qué hacer ahora: ${assessment.immediateAction}`)

  appendList(
    sections,
    'Comprobación recomendada',
    assessment.recommendedChecks
  )

  appendList(sections, 'Limitaciones', assessment.limitations)

  return sections.join('\n\n')
}

/**
 * A low-confidence finding is hedged in the severity line itself, where it
 * cannot be read past. The severity still renders in full: capping certainty
 * never withholds guidance.
 */
function describeSeverity(assessment: DiagnosticAssessment): string {
  const label = SEVERITY_LABELS[assessment.severity]

  return assessment.confidence === 'low'
    ? `${label} (sin confirmar)`
    : label
}

/** Omits the heading entirely when there is nothing under it. */
function appendList(
  sections: string[],
  heading: string,
  items: readonly string[]
): void {
  if (items.length === 0) {
    return
  }

  sections.push(
    `${heading}:\n${items.map(item => `- ${item}`).join('\n')}`
  )
}
