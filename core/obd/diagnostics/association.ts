import type {
  DiagnosticSubsystem,
  DtcExplanation,
  WarningLightCatalog,
  WarningLightEntry,
  WarningLightId
} from './ports'
import type { DtcObservation } from '../dtc/DtcCode'

/**
 * Deliberately NOT exported. Without the symbol, no other module can write
 * an object literal that satisfies `LightDtcAssociation`, so the only way
 * to obtain one is `associateLightWithDtc` below.
 *
 * Honest limit, matching the `PersistableObdSessionEvent` precedent: this
 * makes the type unconstructible without a deliberate `as` cast, not
 * unconstructible outright. TypeScript always permits casts. Do not
 * describe the guarantee as stronger than that.
 */
declare const associationBrand: unique symbol

/**
 * Why an association exists. Every variant names a field one of the two
 * catalogues actually declares, so an association can always be traced
 * back to data somebody wrote down on purpose.
 *
 * There is no `similar-description` variant, and that absence is the
 * requirement (RF-025). Text similarity is not merely discouraged here —
 * the constructor never receives any text to compare, so it has nothing
 * to be talked into.
 */
export type AssociationBasis
  = | {
    readonly kind: 'catalog-dtc-code'
    readonly code: string
  }
  | {
    readonly kind: 'catalog-dtc-prefix'
    readonly prefix: string
  }
  | {
    readonly kind: 'shared-subsystem'
    readonly subsystem: DiagnosticSubsystem
  }

export interface LightDtcAssociation {
  readonly [associationBrand]: 'LightDtcAssociation'
  readonly lightId: WarningLightId
  readonly observation: DtcObservation
  readonly basis: AssociationBasis
}

function normalize(value: string): string {
  return value.trim().toUpperCase()
}

/**
 * Finds the basis, most specific first. An exact code beats a prefix, and
 * a prefix beats a shared subsystem, because that is the order of how much
 * the catalogue author actually committed to.
 */
function findBasis(
  light: WarningLightEntry,
  observation: DtcObservation,
  explanation: DtcExplanation | undefined
): AssociationBasis | undefined {
  const code = normalize(observation.code)

  if (
    light.associatedDtcCodes.some(
      declared => normalize(declared) === code
    )
  ) {
    return { kind: 'catalog-dtc-code', code }
  }

  const prefix = light.associatedDtcPrefixes.find(
    declared => code.startsWith(normalize(declared))
  )

  if (prefix !== undefined) {
    return { kind: 'catalog-dtc-prefix', prefix: normalize(prefix) }
  }

  // A DtcObservation carries no subsystem of its own; only the DTC
  // catalogue knows which system a code belongs to. Without that entry
  // there is nothing to compare, and guessing is the failure mode this
  // whole module exists to prevent.
  if (explanation?.kind !== 'catalog-entry') {
    return undefined
  }

  const subsystem = explanation.entry.subsystems.find(
    candidate => light.subsystems.includes(candidate)
  )

  return subsystem === undefined
    ? undefined
    : { kind: 'shared-subsystem', subsystem }
}

/**
 * The sole constructor of `LightDtcAssociation`. Returns `undefined` when
 * neither catalogue declares a link — an unassociated pair is a normal,
 * expected result, not an error.
 *
 * `explanation` is the DTC's own catalogue lookup. It is optional because
 * the first two bases do not need it; supply it whenever it is available,
 * or the `shared-subsystem` basis can never be reached.
 */
export function associateLightWithDtc(
  light: WarningLightEntry,
  observation: DtcObservation,
  explanation?: DtcExplanation
): LightDtcAssociation | undefined {
  const basis = findBasis(light, observation, explanation)

  if (basis === undefined) {
    return undefined
  }

  return {
    lightId: light.id,
    observation,
    basis
  } as LightDtcAssociation
}

/**
 * RF-024's second entry path: from a DTC already read in this session to
 * the lights it could explain. Returns only lights the catalogue declares
 * compatible — an empty result means no mapping exists, never "look at
 * the closest one".
 */
export function associateLightsWithDtc(
  catalog: WarningLightCatalog,
  observation: DtcObservation,
  explanation?: DtcExplanation
): readonly LightDtcAssociation[] {
  return catalog
    .all()
    .map(light =>
      associateLightWithDtc(light, observation, explanation)
    )
    .filter(
      (association): association is LightDtcAssociation =>
        association !== undefined
    )
}
