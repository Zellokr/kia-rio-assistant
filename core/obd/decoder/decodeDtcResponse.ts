import {
  decodeDtcPairs
} from './decodeDtcPairs'
import {
  parseHexBytes
} from './parseHexBytes'
import type {
  DtcCode,
  DtcState
} from '../dtc/DtcCode'

export interface DtcModeDescriptor {
  readonly command: '03' | '07' | '0A'
  readonly leadingByte: 0x43 | 0x47 | 0x4A
  readonly state: DtcState
}

/**
 * The three SAE J1979 DTC-reading modes, mapped to the response leading
 * byte they produce and the `DtcState` they represent. State comes from
 * HERE, never from the response bytes: the SAE J1979 frame carries no state
 * marker.
 */
export const DTC_MODES = {
  stored: {
    command: '03',
    leadingByte: 0x43,
    state: 'stored'
  },
  pending: {
    command: '07',
    leadingByte: 0x47,
    state: 'pending'
  },
  permanent: {
    command: '0A',
    leadingByte: 0x4A,
    state: 'permanent'
  }
} as const satisfies Record<string, DtcModeDescriptor>

export type DecodedDtcResponse
  = | {
    readonly kind: 'complete'
    readonly state: DtcState
    readonly codes: readonly DtcCode[]
  }
  | {
    readonly kind: 'incomplete'
    readonly state: DtcState
    readonly codes: readonly DtcCode[]
    readonly reason: 'unvalidated-multi-frame' | 'trailing-odd-byte'
    readonly rawByteCount: number
  }

/**
 * Validated single-frame envelope: up to three 2-byte DTC pairs after the
 * leading response byte, per SAE J1979 / ISO 15765-4 single-frame format.
 * See docs/DTC_PHYSICAL_VALIDATION.md check 1 — multi-frame responses (more
 * than this many pairs) are NOT validated against the real vehicle.
 */
const MAX_VALIDATED_PAIRS = 3

/**
 * Decodes a DTC response ($03 stored, $07 pending, $0A permanent) into its
 * structured codes, per the mode descriptor supplied by the caller.
 *
 * VALIDATED SCOPE: a single-frame response, where up to three 2-byte DTC
 * pairs follow the mode's leading byte directly, unused slots padded with
 * 0x00, and there is NO leading DTC-count byte. This matches the documented
 * single-frame format and is exercised by the unit tests.
 *
 * NOT YET VALIDATED: multi-frame responses (more than three DTCs), where CAN
 * ISO-TP framing and a possible DTC-count byte could change the byte layout.
 * Some stacks (e.g. python-OBD) strip a count byte after the leading byte;
 * whether the target adapter/vehicle emits one is unconfirmed until check 1
 * of docs/DTC_PHYSICAL_VALIDATION.md is run with more than three stored
 * codes. This decoder deliberately does NOT guess: it never strips a count
 * byte and never silently discards data. A response with more pairs than the
 * validated envelope supports is reported as `incomplete`, carrying whatever
 * was safely decoded, rather than being trusted or truncated.
 */
export function decodeDtcResponse(
  response: string,
  mode: DtcModeDescriptor
): DecodedDtcResponse {
  const bytes = parseHexBytes(response)

  if (bytes.length < 1) {
    throw new Error(
      `Empty Mode ${mode.command} response`
    )
  }

  if (bytes[0] !== mode.leadingByte) {
    throw new Error(
      `Expected Mode ${mode.command} response`
    )
  }

  const dataBytes = bytes.slice(1)

  if (dataBytes.length % 2 !== 0) {
    return {
      kind: 'incomplete',
      state: mode.state,
      reason: 'trailing-odd-byte',
      rawByteCount: bytes.length,
      codes: decodeDtcPairs(
        dataBytes.slice(0, dataBytes.length - 1)
      )
    }
  }

  const pairCount = dataBytes.length / 2

  if (pairCount > MAX_VALIDATED_PAIRS) {
    return {
      kind: 'incomplete',
      state: mode.state,
      reason: 'unvalidated-multi-frame',
      rawByteCount: bytes.length,
      codes: decodeDtcPairs(dataBytes)
    }
  }

  return {
    kind: 'complete',
    state: mode.state,
    codes: decodeDtcPairs(dataBytes)
  }
}
