import type { DtcCode, DtcSystem } from '../dtc/DtcCode'

/**
 * Vehicle systems a fault can belong to. Deliberately coarse: this is the
 * granularity a driver-facing assessment needs, and the only thing it is
 * used for is deciding whether a warning light and a DTC touch the same
 * area of the car (RF-025). A finer taxonomy would invite associations the
 * catalogue cannot actually justify.
 */
export type DiagnosticSubsystem
  = | 'engine'
    | 'transmission'
    | 'emissions'
    | 'fuel'
    | 'cooling'
    | 'brakes'
    | 'steering'
    | 'suspension'
    | 'electrical'
    | 'restraints'
    | 'tyres'
    | 'lighting'
    | 'network'

export type DiagnosticSeverity = 'info' | 'warning' | 'critical'

export type DiagnosticConfidence = 'low' | 'medium' | 'high'

/** Least to most serious. The order IS the comparison. */
export const DIAGNOSTIC_SEVERITY_ORDER = [
  'info',
  'warning',
  'critical'
] as const satisfies readonly DiagnosticSeverity[]

export function compareDiagnosticSeverity(
  left: DiagnosticSeverity,
  right: DiagnosticSeverity
): number {
  return DIAGNOSTIC_SEVERITY_ORDER.indexOf(left)
    - DIAGNOSTIC_SEVERITY_ORDER.indexOf(right)
}

/**
 * RF-027 seam. Typed so Fase 3 can attach workshop-manual pointers without
 * reshaping the catalogue, and NOT read anywhere in Fase 2: this project
 * ships no manual data, and an unread field is honest where an empty array
 * of fabricated references would not be.
 */
export interface ManualReference {
  readonly title: string
  readonly section: string
  readonly page?: number
}

/**
 * RF-028 seam. Same contract as `ManualReference`: declared, never read in
 * Fase 2. The catalogue currently covers one vehicle, so filtering by
 * applicability would be a no-op dressed up as a feature.
 */
export interface VehicleApplicability {
  readonly model: string
  readonly generation: string
  readonly yearFrom: number
  readonly yearTo?: number
}

export interface DtcCatalogEntry {
  readonly code: string
  /** Spanish, user-facing. */
  readonly title: string
  readonly severity: DiagnosticSeverity
  readonly possibleCauses: readonly string[]
  readonly recommendedChecks: readonly string[]
  /** Spanish, user-facing, conservative. */
  readonly immediateAction: string
  readonly subsystems: readonly DiagnosticSubsystem[]
  readonly manualReferences?: readonly ManualReference[]
}

/**
 * The honest outcome of a catalogue lookup. `no-entry` is a first-class
 * result, not an error and not an empty entry: the code is real, the
 * catalogue simply does not describe it, and saying so is the only
 * truthful answer available (RF-021).
 */
export type DtcExplanation
  = | {
    readonly kind: 'catalog-entry'
    readonly entry: DtcCatalogEntry
  }
  | {
    readonly kind: 'no-entry'
    readonly code: string
    readonly system: DtcSystem
  }

export interface DtcCatalog {
  readonly lookup: (code: DtcCode) => DtcExplanation
}

export type WarningLightId = string

export type WarningLightColor
  = | 'red'
    | 'amber'
    | 'green'
    | 'blue'
    | 'white'

export type WarningLightBehavior = 'steady' | 'blinking'

export interface WarningLightEntry {
  readonly id: WarningLightId
  /** Spanish, user-facing. */
  readonly name: string
  readonly color: WarningLightColor
  readonly shape: string
  readonly behavior: readonly WarningLightBehavior[]
  readonly displayTextKeywords: readonly string[]
  readonly symptoms: readonly string[]
  readonly severity: DiagnosticSeverity
  /** Spanish, user-facing, conservative. */
  readonly immediateAction: string
  readonly recommendedChecks: readonly string[]
  /**
   * The three declared sources an association may be built from (RF-025).
   * Text similarity is deliberately absent: an association that cannot name
   * its basis must not exist.
   */
  readonly associatedDtcCodes: readonly string[]
  readonly associatedDtcPrefixes: readonly string[]
  readonly subsystems: readonly DiagnosticSubsystem[]
  readonly applicability?: VehicleApplicability
}

export interface WarningLightCatalog {
  readonly all: () => readonly WarningLightEntry[]
  readonly byId: (id: WarningLightId) => WarningLightEntry | undefined
}
