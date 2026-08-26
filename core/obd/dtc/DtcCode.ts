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
 * manufacturer-specific extension, per the second character of the code
 * (e.g. the "0" in "P0300" is generic, the "1" in "P1300" is
 * manufacturer-specific).
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

function classifyDtcType(typeDigit: string): DtcType {
  return typeDigit === '0' || typeDigit === '2'
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
    typeDigit
  ] = match

  return {
    code,
    system: system as DtcSystem,
    type: classifyDtcType(typeDigit!)
  }
}
