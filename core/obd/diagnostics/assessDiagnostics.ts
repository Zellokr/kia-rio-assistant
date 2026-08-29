import {
  compareDiagnosticSeverity
} from './ports'
import type {
  DiagnosticConfidence,
  DiagnosticSeverity,
  DtcCatalog,
  DtcCatalogEntry,
  DtcExplanation
} from './ports'
import type { DtcCode } from '../dtc/DtcCode'
import type { DtcReadOutcome } from '../usecases/readDiagnosticCodes'

/**
 * Where a piece of evidence came from. Spec §8.2's own five values.
 *
 * A catalogue lookup is reported as `dtc`, the same as the read it describes,
 * and that is deliberate: §8.2 has no value for a local rule, and giving one
 * its own value is what previously let a catalogued read corroborate itself
 * into `high` confidence. Sharing the value makes the set dedupe, so the
 * safeguard is now structural instead of a list that has to be maintained.
 *
 * `pid`, `light` and `manual` are declared and never produced yet: this
 * project ships no manual data, and the assessment is built from DTC reads
 * rather than live PIDs or tell-tales.
 */
export type DiagnosticEvidenceType
  = | 'pid'
    | 'dtc'
    | 'driver'
    | 'light'
    | 'manual'

export interface DiagnosticEvidence {
  readonly type: DiagnosticEvidenceType
  /** Spanish, user-facing. */
  readonly description: string
}

export interface DiagnosticContext {
  readonly reads: readonly DtcReadOutcome[]
  readonly adapterConnected: boolean
  readonly driverReportedSymptoms?: readonly string[]
}

/**
 * Spec §8.2, all eight fields.
 *
 * This used to carry six and claim in a comment that it matched §8.2
 * "exactly". It did not: `dtcs` and `recommendedChecks` were missing, and
 * `evidence` used different field names and a different value set. The
 * comment's own warning was right — RF-032 sends this structure to the AI, so
 * a fork here forks a contract another phase depends on — it just pointed the
 * wrong way. Fase 3 is that phase, and it would have sent an assessment
 * without the codes that caused it.
 *
 * Anything worth saying that §8.2 has no field for travels inside `evidence`
 * or `limitations`. Do not add a ninth field.
 */
export interface DiagnosticAssessment {
  readonly severity: DiagnosticSeverity
  readonly confidence: DiagnosticConfidence
  /** The codes this assessment was built from, in the order encountered. */
  readonly dtcs: readonly string[]
  readonly evidence: readonly DiagnosticEvidence[]
  readonly possibleCauses: readonly string[]
  readonly immediateAction: string
  readonly recommendedChecks: readonly string[]
  readonly limitations: readonly string[]
}

/** Spec §10.5 wording. User-facing copy — do not paraphrase. */
const UNCONFIRMED_CAUSE_LIMITATION
  = 'No se ha confirmado la causa mediante OBD-II'

const NO_ADAPTER_LIMITATION
  = 'No hay ningún adaptador conectado, así que no se ha podido leer '
    + 'el vehículo en esta sesión'

/**
 * Used when severity demands an action and the catalogue supplies none —
 * an uncovered code, or a severity reached with no entry behind it. The
 * driver is never left without an instruction, and the instruction never
 * assumes a cause.
 */
const CONSERVATIVE_ACTIONS: Record<DiagnosticSeverity, string> = {
  critical:
    'Detén el vehículo en un lugar seguro, apaga el motor y no sigas '
    + 'conduciendo hasta que un taller revise el fallo.',
  warning:
    'Puedes seguir conduciendo con precaución, pero lleva el vehículo a '
    + 'un taller para que revise el fallo lo antes posible.',
  info:
    'No requiere una acción inmediata. Comenta el aviso en el próximo '
    + 'mantenimiento.'
}

const STATE_LABELS = {
  stored: 'almacenados',
  pending: 'pendientes',
  permanent: 'permanentes'
} as const

const EVIDENCE_TYPE_ORDER: readonly DiagnosticEvidenceType[] = [
  'pid',
  'dtc',
  'manual',
  'light',
  'driver'
]

interface ContributingCode {
  readonly code: DtcCode
  readonly explanation: DtcExplanation
  /** False when the read this code came from could not be fully decoded. */
  readonly fromCompleteRead: boolean
}

/**
 * Builds the local, offline assessment shown to the driver.
 *
 * Two rules carry most of the weight here, and both exist to stop the
 * assessment claiming more than it knows:
 *
 * - A code with no catalogue entry floors at `warning`. The ECU stored a
 *   fault; the catalogue merely fails to describe it. Reporting `info`
 *   would tell the driver it is unimportant, which nothing supports.
 * - Confidence caps at `low` whenever any input is unconfirmed, incomplete,
 *   uncovered, or was read with no adapter attached. Severity and the
 *   conservative action still render — capping confidence withholds
 *   certainty, never guidance.
 *
 * Nothing here reads `manualReferences` or `applicability`; those are Fase 3
 * seams (RF-027/028).
 */
export function assessDiagnostics(
  context: DiagnosticContext,
  catalog: DtcCatalog
): DiagnosticAssessment {
  const contributing = collectContributingCodes(context, catalog)
  const severity = resolveSeverity(contributing)

  return {
    severity,
    confidence: resolveConfidence(context, contributing),
    dtcs: collectDtcs(contributing),
    evidence: buildEvidence(context, contributing),
    possibleCauses: collectCauses(contributing),
    immediateAction: resolveImmediateAction(contributing, severity),
    recommendedChecks: collectRecommendedChecks(contributing),
    limitations: collectLimitations(context, contributing)
  }
}

function collectContributingCodes(
  context: DiagnosticContext,
  catalog: DtcCatalog
): readonly ContributingCode[] {
  return context.reads.flatMap((read) => {
    if (read.kind !== 'codes') {
      return []
    }

    return read.codes.map(code => ({
      code,
      explanation: catalog.lookup(code),
      fromCompleteRead: read.complete
    }))
  })
}

function entryOf(
  contributing: ContributingCode
): DtcCatalogEntry | undefined {
  return contributing.explanation.kind === 'catalog-entry'
    ? contributing.explanation.entry
    : undefined
}

function severityOf(
  contributing: ContributingCode
): DiagnosticSeverity {
  // A code the catalogue does not describe still floors at `warning`.
  return entryOf(contributing)?.severity ?? 'warning'
}

function resolveSeverity(
  contributing: readonly ContributingCode[]
): DiagnosticSeverity {
  return contributing.reduce<DiagnosticSeverity>(
    (worst, item) => {
      const current = severityOf(item)

      return compareDiagnosticSeverity(current, worst) > 0
        ? current
        : worst
    },
    'info'
  )
}

function resolveImmediateAction(
  contributing: readonly ContributingCode[],
  severity: DiagnosticSeverity
): string {
  const drivingEntry = contributing
    .filter(item => severityOf(item) === severity)
    .map(entryOf)
    .find(entry => entry !== undefined)

  return drivingEntry?.immediateAction
    ?? CONSERVATIVE_ACTIONS[severity]
}

/** The codes behind the assessment, deduplicated, in the order encountered. */
function collectDtcs(
  contributing: readonly ContributingCode[]
): readonly string[] {
  const codes: string[] = []

  for (const item of contributing) {
    if (!codes.includes(item.code.code)) {
      codes.push(item.code.code)
    }
  }

  return codes
}

/**
 * What the catalogue suggests looking at. An uncovered code contributes
 * nothing here rather than a guess — the conservative `immediateAction`
 * already covers the driver when the catalogue is silent.
 */
function collectRecommendedChecks(
  contributing: readonly ContributingCode[]
): readonly string[] {
  const checks: string[] = []

  for (const item of contributing) {
    for (const check of entryOf(item)?.recommendedChecks ?? []) {
      if (!checks.includes(check)) {
        checks.push(check)
      }
    }
  }

  return checks
}

function collectCauses(
  contributing: readonly ContributingCode[]
): readonly string[] {
  const causes: string[] = []

  for (const item of contributing) {
    for (const cause of entryOf(item)?.possibleCauses ?? []) {
      if (!causes.includes(cause)) {
        causes.push(cause)
      }
    }
  }

  return causes
}

function resolveConfidence(
  context: DiagnosticContext,
  contributing: readonly ContributingCode[]
): DiagnosticConfidence {
  const capped = !context.adapterConnected
    || context.reads.some(read => read.kind === 'unconfirmed')
    || contributing.some(item => !item.fromCompleteRead)
    || contributing.some(item => item.explanation.kind === 'no-entry')

  if (capped) {
    return 'low'
  }

  const hasCatalogued = contributing.some(
    item => entryOf(item) !== undefined
  )

  if (!hasCatalogued) {
    return 'low'
  }

  const corroborating = new Set(
    buildEvidence(context, contributing)
      .map(item => item.type)
  )

  return corroborating.size >= 2
    ? 'high'
    : 'medium'
}

function buildEvidence(
  context: DiagnosticContext,
  contributing: readonly ContributingCode[]
): readonly DiagnosticEvidence[] {
  const evidence: DiagnosticEvidence[] = []

  for (const read of context.reads) {
    evidence.push({
      type: 'dtc',
      description: describeRead(read)
    })
  }

  for (const item of contributing) {
    const entry = entryOf(item)

    if (entry) {
      evidence.push({
        type: 'dtc',
        description: `${entry.code}: ${entry.title}`
      })
    }
  }

  for (const symptom of context.driverReportedSymptoms ?? []) {
    evidence.push({
      type: 'driver',
      description: symptom
    })
  }

  // `manual` never appears: Fase 2 has no manual data to cite.
  return [...evidence].sort(
    (left, right) =>
      EVIDENCE_TYPE_ORDER.indexOf(left.type)
      - EVIDENCE_TYPE_ORDER.indexOf(right.type)
  )
}

function describeRead(read: DtcReadOutcome): string {
  const label = STATE_LABELS[read.state]

  switch (read.kind) {
    case 'codes':
      return read.complete
        ? `Lectura de códigos ${label}: ${read.codes.length} código(s)`
        : `Lectura de códigos ${label} incompleta: `
          + `${read.codes.length} código(s) descodificado(s)`
    case 'no-codes-reported':
      return `El vehículo respondió sin códigos ${label}`
    case 'unconfirmed':
      return `Códigos ${label} sin confirmar`
    case 'failed':
      return `La lectura de códigos ${label} falló`
  }
}

function collectLimitations(
  context: DiagnosticContext,
  contributing: readonly ContributingCode[]
): readonly string[] {
  const limitations: string[] = []

  if (!context.adapterConnected) {
    limitations.push(NO_ADAPTER_LIMITATION)
  }

  for (const read of context.reads) {
    const label = STATE_LABELS[read.state]

    if (read.kind === 'unconfirmed') {
      // Never "sin pendientes": nothing was confirmed either way.
      limitations.push(
        `Los códigos ${label} quedan sin confirmar; el vehículo no `
        + 'respondió a esa lectura'
      )
    }

    if (read.kind === 'failed') {
      limitations.push(
        `La lectura de códigos ${label} falló, así que no se ha `
        + 'descartado nada en esa lectura'
      )
    }

    if (read.kind === 'codes' && !read.complete) {
      limitations.push(
        `La lectura de códigos ${label} está incompleta; puede haber `
        + 'más códigos de los que se muestran'
      )
    }
  }

  for (const item of contributing) {
    if (item.explanation.kind === 'no-entry') {
      limitations.push(
        `El código ${item.explanation.code} es válido pero no está `
        + 'descrito en el catálogo local'
      )
    }
  }

  if (!hasConfirmedCause(contributing)) {
    limitations.push(UNCONFIRMED_CAUSE_LIMITATION)
  }

  return limitations
}

/**
 * A cause counts as confirmed only when it came from a code that was both
 * fully decoded and described by the catalogue. Anything less is a guess
 * wearing a diagnosis, and §10.5 requires saying so.
 */
function hasConfirmedCause(
  contributing: readonly ContributingCode[]
): boolean {
  return contributing.some(
    item => item.fromCompleteRead && entryOf(item) !== undefined
  )
}
