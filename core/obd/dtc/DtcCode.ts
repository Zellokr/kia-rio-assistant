/**
 * SAE J1979 / ISO 15031-6 DTC system, encoded in the two most significant
 * bits of the first response byte: Powertrain, Chassis, Body, Network.
 */
export type DtcSystem = 'P' | 'C' | 'B' | 'U'

/**
 * Where a DTC was read from, per SAE J1979 mode ($03/$07/$0A). The mode is
 * the ONLY source of this value: no byte in a DTC response carries a state
 * marker, so state must never be inferred from response data.
 */
export type DtcState = 'stored' | 'pending' | 'permanent'

/**
 * Whether a DTC belongs to the SAE-defined generic set or to a
 * manufacturer-specific extension.
 *
 * This is NOT a plain read of the second character: SAE J2012 gives that
 * digit different meanings per system, so it must be classified together
 * with the system letter. See `classifyDtcType`.
 */
export type DtcType = 'generic' | 'manufacturer'

export interface DtcCode {
  readonly code: string
  readonly system: DtcSystem
  readonly type: DtcType
}

export interface DtcObservation extends DtcCode {
  readonly state: DtcState
  readonly observedAt: string
}

const DTC_CODE_PATTERN = /^([PCBU])([0-3])([0-9A-F]{3})$/

/**
 * Classifies a DTC as SAE-generic or manufacturer-specific.
 *
 * The second digit does NOT carry one meaning across all four systems, so
 * classifying it without the system letter mislabels Chassis, Body and
 * Network codes. Per SAE J2012:
 *
 * - Powertrain: `0` and `2` are SAE-defined, `1` is manufacturer-specific,
 *   and `3` is split — P3000-P3399 are manufacturer-defined while
 *   P3400-P3999 revert to SAE.
 * - Chassis, Body, Network: only `0` is SAE-defined. Both `1` AND `2` are
 *   manufacturer-specific, and `3` is reserved by SAE rather than delegated
 *   to the manufacturer, so it classifies as generic.
 */
function classifyDtcType(
  system: DtcSystem,
  typeDigit: string,
  remainder: string
): DtcType {
  if (system === 'P') {
    if (typeDigit === '0' || typeDigit === '2') {
      return 'generic'
    }

    if (typeDigit === '1') {
      return 'manufacturer'
    }

    return remainder[0]! < '4'
      ? 'manufacturer'
      : 'generic'
  }

  return typeDigit === '0' || typeDigit === '3'
    ? 'generic'
    : 'manufacturer'
}

/**
 * Parses and validates a four-digit DTC string (e.g. "P0300") into its
 * structured parts. Rejects anything that does not match the SAE J1979
 * layout: system letter, one type digit (0-3), then three hexadecimal
 * digits.
 */
export function parseDtcCode(raw: string): DtcCode {
  const normalized = raw.trim().toUpperCase()
  const match = DTC_CODE_PATTERN.exec(normalized)

  if (!match) {
    throw new Error(
      `Malformed DTC code: ${raw}`
    )
  }

  const [
    code,
    system,
    typeDigit,
    remainder
  ] = match

  const dtcSystem = system as DtcSystem

  return {
    code,
    system: dtcSystem,
    type: classifyDtcType(dtcSystem, typeDigit!, remainder!)
  }
}
