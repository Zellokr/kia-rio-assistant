import type {
  DiagnosticAssessment
} from '../obd/diagnostics/assessDiagnostics'
import type { DiagnosticSeverity } from '../obd/diagnostics/ports'
import type {
  DtcReadOutcome
} from '../obd/usecases/readDiagnosticCodes'

/**
 * The report a driver hands to a workshop (RF-037).
 *
 * Its acceptance criterion is the whole design: *"El informe distingue
 * hechos, interpretación y limitaciones."* A mechanic reads this without the
 * app, without the driver, and usually without the car in front of them, so
 * the one failure that matters is letting this tool's inference read as
 * something the vehicle said.
 *
 * Three sections, always all three, always in that order. The facts section
 * carries only what came back over OBD-II. The interpretation section carries
 * what the local rules engine concluded from a **generic SAE catalogue**, and
 * says so. The limitations section carries what nobody can conclude from this
 * report at all.
 *
 * The distinction the facts section protects hardest is the one
 * `readDiagnosticCodes` was written for: a padded frame with no codes is the
 * vehicle reporting zero, while `NO DATA` is the vehicle saying nothing. A
 * workshop told "no pending codes" when the truth is "the car never answered"
 * would rule out a fault nobody ruled out. Whether this Kia Rio answers $07
 * and $0A with one or the other is still unconfirmed — see check 2 of
 * `docs/DTC_PHYSICAL_VALIDATION.md`.
 */

export interface WorkshopReportReading {
  readonly label: string
  readonly value: number
  readonly unit: string
}

export interface WorkshopReportInput {
  readonly sessionId: string
  readonly startedAt: string
  readonly reads: readonly DtcReadOutcome[]
  readonly assessment: DiagnosticAssessment | null
  readonly telemetry: readonly WorkshopReportReading[]
  readonly generatedAtMs: number
}

const STATE_LABELS = {
  stored: 'almacenados',
  pending: 'pendientes',
  permanent: 'permanentes'
} as const

const SEVERITY_LABELS: Record<DiagnosticSeverity, string> = {
  info: 'Información',
  critical: 'Crítica',
  warning: 'Advertencia'
}

const FAILURE_REASONS = {
  timeout: 'el adaptador no respondió a tiempo',
  transport: 'se perdió la conexión con el adaptador',
  protocol: 'la respuesta no se pudo interpretar'
} as const

const INCOMPLETE_REASONS = {
  'unvalidated-multi-frame': 'la respuesta llegó en varias tramas sin validar',
  'trailing-odd-byte': 'la respuesta terminó en un byte suelto'
} as const

/**
 * True of every session this app can produce, so they are stated every time
 * rather than derived from the data. A workshop that only sees a clean report
 * still needs to know the app never cleared anything and never looked at a
 * freeze frame.
 */
const ALWAYS_TRUE_LIMITATIONS: readonly string[] = [
  'Esta aplicación es de solo lectura: no se ha borrado ningún código ni se '
  + 'ha escrito nada en la centralita.',
  'Los códigos se han interpretado con un catálogo genérico SAE, no con el '
  + 'catálogo específico de Kia. Un código propio del fabricante puede '
  + 'aparecer sin descripción o con una descripción genérica.',
  'No se ha leído ninguna trama congelada (modo 02): ese modo no está en la '
  + 'lista de comandos permitidos de esta aplicación.',
  'No se ha leído el cuentakilómetros del vehículo. Cualquier kilometraje que '
  + 'acompañe a este informe lo ha escrito una persona.'
]

export function composeWorkshopReport(input: WorkshopReportInput): string {
  return [
    header(input),
    '',
    'HECHOS — lo que informó el vehículo',
    ...facts(input),
    '',
    'INTERPRETACIÓN — lo que dedujo esta aplicación',
    ...interpretation(input.assessment),
    '',
    'LIMITACIONES — lo que este informe no puede afirmar',
    ...limitations(input)
  ].join('\n')
}

function header(input: WorkshopReportInput): string {
  return [
    'INFORME DE SESIÓN OBD-II',
    `Sesión: ${input.sessionId}`,
    `Inicio: ${input.startedAt}`,
    `Generado: ${new Date(input.generatedAtMs).toISOString()}`
  ].join('\n')
}

function facts(input: WorkshopReportInput): string[] {
  const lines: string[] = []

  if (input.reads.length === 0) {
    lines.push('- No se ha leído ningún modo de diagnóstico en esta sesión.')
  }

  for (const read of input.reads) {
    lines.push(`- ${describeRead(read)}`)
  }

  for (const reading of input.telemetry) {
    lines.push(`- ${reading.label}: ${reading.value} ${reading.unit}`)
  }

  return lines
}

function describeRead(read: DtcReadOutcome): string {
  const state = STATE_LABELS[read.state]

  switch (read.kind) {
    case 'codes':
      return `Códigos ${state}: ${read.codes.map(code => code.code).join(', ')}`

    case 'no-codes-reported':
      // The ECU answered, and its answer was zero.
      return `Códigos ${state}: el vehículo informó de cero códigos.`

    case 'unconfirmed':
      // The ECU did not answer. This is the line that must never be mistaken
      // for the one above it.
      return `Códigos ${state}: el vehículo no respondió a esta consulta, `
        + 'así que no es un cero confirmado.'

    case 'failed':
      return `Códigos ${state}: no se pudo leer — `
        + `${FAILURE_REASONS[read.reason]}.`
  }
}

function interpretation(assessment: DiagnosticAssessment | null): string[] {
  if (!assessment) {
    return [
      '- No se ha emitido ninguna evaluación: no hay lecturas sobre las que '
      + 'deducir nada.'
    ]
  }

  const lines = [
    `- Gravedad estimada: ${SEVERITY_LABELS[assessment.severity]} `
    + `(confianza ${assessment.confidence}).`
  ]

  appendList(lines, 'Evidencias consideradas',
    assessment.evidence.map(item => item.description))
  appendList(lines, 'Causas posibles', assessment.possibleCauses)

  lines.push(`- Acción inmediata sugerida: ${assessment.immediateAction}`)

  appendList(lines, 'Comprobaciones recomendadas', assessment.recommendedChecks)

  lines.push(
    '- Todo lo anterior lo dedujo esta aplicación a partir de los códigos '
    + 'leídos. No es un diagnóstico del fabricante ni sustituye una '
    + 'comprobación en taller.'
  )

  return lines
}

function limitations(input: WorkshopReportInput): string[] {
  const lines = ALWAYS_TRUE_LIMITATIONS.map(limitation => `- ${limitation}`)

  for (const read of input.reads) {
    if (read.kind === 'codes' && !read.complete) {
      lines.push(
        `- La lectura de códigos ${STATE_LABELS[read.state]} no se pudo `
        + `decodificar por completo: `
        + `${INCOMPLETE_REASONS[read.incompleteReason ?? 'trailing-odd-byte']}. `
        + 'Puede faltar algún código.'
      )
    }

    if (read.kind === 'unconfirmed') {
      lines.push(
        `- No se puede afirmar que no haya códigos ${STATE_LABELS[read.state]}: `
        + 'el vehículo no respondió a esa consulta.'
      )
    }
  }

  for (const limitation of input.assessment?.limitations ?? []) {
    lines.push(`- ${limitation}`)
  }

  return lines
}

function appendList(
  lines: string[],
  heading: string,
  items: readonly string[]
): void {
  if (items.length === 0) {
    return
  }

  lines.push(`- ${heading}: ${items.join('; ')}`)
}
