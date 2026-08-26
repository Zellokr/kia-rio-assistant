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
 * Where a piece of evidence came from, in the priority order of spec §10.4:
 * OBD data first, then local rules, then the workshop manual, then what the
 * driver reported. `manual` is declared but never produced in Fase 2 — this
 * project ships no manual data.
 */
export type DiagnosticEvidenceSource
  = | 'obd-data'
    | 'local-rules'
    | 'manual'
    | 'driver-input'

export interface DiagnosticEvidence {
  readonly source: DiagnosticEvidenceSource
  /** Spanish, user-facing. */
  readonly summary: string
}

export interface DiagnosticContext {
  readonly reads: readonly DtcReadOutcome[]
  readonly adapterConnected: boolean
  readonly driverReportedSymptoms?: readonly string[]
}

/**
 * Spec §8.2, exactly. Six fields, no more: Fase 3 sends this structure to
 * the AI, so adding a field here forks a contract another phase depends on.
 * Anything else worth saying travels inside `evidence` or `limitations`.
 */
export interface DiagnosticAssessment {
  readonly severity: DiagnosticSeverity
  readonly confidence: DiagnosticConfidence
  readonly evidence: readonly DiagnosticEvidence[]
  readonly possibleCauses: readonly string[]
  readonly immediateAction: string
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

const EVIDENCE_SOURCE_ORDER: readonly DiagnosticEvidenceSource[] = [
  'obd-data',
  'local-rules',
  'manual',
  'driver-input'
]

/**
 * Sources that can corroborate ONE ANOTHER. `local-rules` is excluded on
 * purpose: a catalogue entry is this project's interpretation of the very
 * code the OBD read produced, not a second, independent observation of the
 * fault. Counting it would let every catalogued single read call itself
 * `high` confidence on the strength of its own lookup.
 */
const CORROBORATING_SOURCES: readonly DiagnosticEvidenceSource[] = [
  'obd-data',
  'manual',
  'driver-input'
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
    evidence: buildEvidence(context, contributing),
    possibleCauses: collectCauses(contributing),
    immediateAction: resolveImmediateAction(contributing, severity),
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
      .map(item => item.source)
      .filter(source => CORROBORATING_SOURCES.includes(source))
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
      source: 'obd-data',
      summary: describeRead(read)
    })
  }

  for (const item of contributing) {
    const entry = entryOf(item)

    if (entry) {
      evidence.push({
        source: 'local-rules',
        summary: `${entry.code}: ${entry.title}`
      })
    }
  }

  for (const symptom of context.driverReportedSymptoms ?? []) {
    evidence.push({
      source: 'driver-input',
      summary: symptom
    })
  }

  // `manual` never appears: Fase 2 has no manual data to cite.
  return [...evidence].sort(
    (left, right) =>
      EVIDENCE_SOURCE_ORDER.indexOf(left.source)
      - EVIDENCE_SOURCE_ORDER.indexOf(right.source)
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
