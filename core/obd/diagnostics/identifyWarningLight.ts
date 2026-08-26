import type {
  DiagnosticConfidence,
  DiagnosticSeverity,
  WarningLightBehavior,
  WarningLightCatalog,
  WarningLightColor,
  WarningLightEntry
} from './ports'

/** Spec §11.1, in the order the guided script asks them. */
export const LIGHT_QUESTIONS = [
  'color',
  'shape',
  'behavior',
  'displayText',
  'symptoms'
] as const

export type LightQuestion = (typeof LIGHT_QUESTIONS)[number]

export interface LightAnswers {
  readonly color?: WarningLightColor
  readonly shape?: string
  readonly behavior?: WarningLightBehavior
  readonly displayText?: string
  readonly symptoms?: readonly string[]
  /**
   * The driver chose "no identificado". Always available, at any point,
   * and never inferred — only the user sets this.
   */
  readonly optedOut?: boolean
}

export interface IdentificationContext {
  readonly answers: LightAnswers
  readonly adapterConnected: boolean
}

/**
 * What to tell a driver when the light could not be identified. Every
 * field is mandatory, so `unidentified` cannot be constructed without
 * something useful to say.
 */
export interface SafeAlternative {
  readonly severityFloor: DiagnosticSeverity
  /** Spanish, conservative. */
  readonly immediateAction: string
  readonly recommendedChecks: readonly string[]
  readonly limitations: readonly string[]
}

/**
 * A total union (RF-026). Every outcome the flow can reach is one of these
 * three, so an exhaustive switch in the UI cannot silently miss a case —
 * in particular it cannot miss `unidentified`, which is the one the UI is
 * most tempted to skip.
 */
export type WarningLightIdentification
  = | {
    readonly kind: 'match'
    readonly light: WarningLightEntry
    readonly answers: LightAnswers
    readonly confidence: DiagnosticConfidence
    readonly limitations: readonly string[]
  }
  | {
    readonly kind: 'candidates'
    readonly candidates: readonly WarningLightEntry[]
    readonly nextQuestion: LightQuestion | undefined
    readonly answers: LightAnswers
  }
  | {
    readonly kind: 'unidentified'
    readonly safeAlternative: SafeAlternative
    readonly answers: LightAnswers
  }

/** Spec §10.5 wording. User-facing copy — do not paraphrase. */
const UNCONFIRMED_CAUSE_LIMITATION
  = 'No se ha confirmado la causa mediante OBD-II'

const PARTIAL_SCRIPT_LIMITATION
  = 'La identificación se basa en una descripción incompleta del testigo'

const UNIDENTIFIED_LIMITATION
  = 'No se ha podido identificar el testigo con los datos disponibles'

const SAFE_CHECKS: readonly string[] = [
  'Consultar el manual del vehículo para identificar el símbolo',
  'Comprobar los niveles de aceite y de refrigerante con el motor frío',
  'Leer los códigos de diagnóstico con el adaptador conectado'
]

const CRITICAL_SAFE_ACTION
  = 'Detén el vehículo en un lugar seguro y apaga el motor. Un testigo '
    + 'rojo sin identificar se trata como grave hasta que se demuestre lo '
    + 'contrario.'

const WARNING_SAFE_ACTION
  = 'Conduce con precaución y acude a un taller para identificar el '
    + 'testigo. Si aparecen ruidos, humo, pérdida de potencia o el testigo '
    + 'se vuelve rojo, detén el vehículo en un lugar seguro.'

function answered(
  answers: LightAnswers,
  question: LightQuestion
): boolean {
  switch (question) {
    case 'color':
      return answers.color !== undefined
    case 'shape':
      return answers.shape !== undefined
    case 'behavior':
      return answers.behavior !== undefined
    case 'displayText':
      return answers.displayText !== undefined
    case 'symptoms':
      return (answers.symptoms?.length ?? 0) > 0
  }
}

function includesIgnoringCase(
  haystack: string,
  needle: string
): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

/**
 * Every answered question narrows the set, and an entry must satisfy all
 * of them. Nothing is scored or ranked: a "closest" entry that fails an
 * answer the driver actually gave is not a weaker match, it is a wrong
 * one, and surfacing it as a best guess is the behaviour RF-026 forbids.
 */
function matchesAnswers(
  entry: WarningLightEntry,
  answers: LightAnswers
): boolean {
  if (answers.color !== undefined && entry.color !== answers.color) {
    return false
  }

  if (answers.shape !== undefined && entry.shape !== answers.shape) {
    return false
  }

  if (
    answers.behavior !== undefined
    && !entry.behavior.includes(answers.behavior)
  ) {
    return false
  }

  if (answers.displayText !== undefined) {
    const text = answers.displayText

    // Declared keywords only. The catalogue author decided what text this
    // light shows; this is not free-text similarity scoring.
    if (
      !entry.displayTextKeywords.some(keyword =>
        includesIgnoringCase(text, keyword)
      )
    ) {
      return false
    }
  }

  const symptoms = answers.symptoms ?? []

  if (symptoms.length > 0) {
    const declared = entry.symptoms

    if (
      !symptoms.some(reported =>
        declared.some(known => includesIgnoringCase(known, reported))
      )
    ) {
      return false
    }
  }

  return true
}

/**
 * The first unanswered question whose answer would actually split the
 * remaining candidates. A question every candidate answers identically
 * cannot narrow anything, and asking it only makes the flow feel like it
 * is progressing.
 */
function nextDiscriminatingQuestion(
  candidates: readonly WarningLightEntry[],
  answers: LightAnswers
): LightQuestion | undefined {
  return LIGHT_QUESTIONS.find((question) => {
    if (answered(answers, question)) {
      return false
    }

    return new Set(
      candidates.map(entry => fingerprint(entry, question))
    ).size > 1
  })
}

function fingerprint(
  entry: WarningLightEntry,
  question: LightQuestion
): string {
  switch (question) {
    case 'color':
      return entry.color
    case 'shape':
      return entry.shape
    case 'behavior':
      return [...entry.behavior].sort().join('+')
    case 'displayText':
      return [...entry.displayTextKeywords].sort().join('+')
    case 'symptoms':
      return [...entry.symptoms].sort().join('+')
  }
}

function safeAlternative(
  answers: LightAnswers,
  adapterConnected: boolean
): SafeAlternative {
  // Red is the dashboard's own "stop" convention. An unidentified red
  // light is the one case where guessing low would be dangerous.
  const severityFloor: DiagnosticSeverity
    = answers.color === 'red' ? 'critical' : 'warning'

  const limitations = [UNIDENTIFIED_LIMITATION]

  if (!adapterConnected) {
    limitations.push(UNCONFIRMED_CAUSE_LIMITATION)
  }

  return {
    severityFloor,
    immediateAction: severityFloor === 'critical'
      ? CRITICAL_SAFE_ACTION
      : WARNING_SAFE_ACTION,
    recommendedChecks: SAFE_CHECKS,
    limitations
  }
}

/**
 * Identifies a dashboard warning light from the guided §11.1 answers.
 *
 * No camera, no network: this walks a local catalogue with the driver's
 * own description. Confidence never exceeds `medium`, because a light
 * tells you a system complained, not why — only a DTC read can narrow
 * that, and this function performs none.
 */
export function identifyWarningLight(
  context: IdentificationContext,
  catalog: WarningLightCatalog
): WarningLightIdentification {
  const { answers, adapterConnected } = context

  if (answers.optedOut === true) {
    return {
      kind: 'unidentified',
      safeAlternative: safeAlternative(answers, adapterConnected),
      answers
    }
  }

  const candidates = catalog
    .all()
    .filter(entry => matchesAnswers(entry, answers))

  if (candidates.length === 0) {
    return {
      kind: 'unidentified',
      safeAlternative: safeAlternative(answers, adapterConnected),
      answers
    }
  }

  if (candidates.length > 1) {
    return {
      kind: 'candidates',
      candidates,
      nextQuestion: nextDiscriminatingQuestion(candidates, answers),
      answers
    }
  }

  const scriptComplete = LIGHT_QUESTIONS.every(question =>
    answered(answers, question)
  )
  const limitations: string[] = []

  if (!adapterConnected) {
    limitations.push(UNCONFIRMED_CAUSE_LIMITATION)
  }

  if (!scriptComplete) {
    limitations.push(PARTIAL_SCRIPT_LIMITATION)
  }

  return {
    kind: 'match',
    light: candidates[0]!,
    answers,
    confidence: resolveConfidence(adapterConnected, scriptComplete),
    limitations
  }
}

function resolveConfidence(
  adapterConnected: boolean,
  scriptComplete: boolean
): DiagnosticConfidence {
  if (!adapterConnected || !scriptComplete) {
    return 'low'
  }

  // `high` is unreachable from the guided flow on purpose: identifying the
  // light is not confirming the fault behind it.
  return 'medium'
}
