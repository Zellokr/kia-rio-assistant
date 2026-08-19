import { parseHexBytes } from './parseHexBytes'

export interface DecodedDtcResult {
  dtcs: string[]
}

function decodeDtc(
  firstByte: number,
  secondByte: number
): string {
  const systemBits = (firstByte & 0xC0) >> 6

  const system = [
    'P',
    'C',
    'B',
    'U'
  ][systemBits]

  const digit1 = (
    (firstByte & 0x30) >> 4
  ).toString(16).toUpperCase()

  const digit2 = (
    firstByte & 0x0F
  ).toString(16).toUpperCase()

  const digit3 = (
    (secondByte & 0xF0) >> 4
  ).toString(16).toUpperCase()

  const digit4 = (
    secondByte & 0x0F
  ).toString(16).toUpperCase()

  return `${system}${digit1}${digit2}${digit3}${digit4}`
}

/**
 * Decodes a Mode 03 (stored DTCs) response.
 *
 * VALIDATED SCOPE: a single-frame SAE J1979 / ISO 15765-4 response, where up
 * to three 2-byte DTC pairs follow 0x43 directly, unused slots padded with
 * 0x00, and there is NO leading DTC-count byte. This matches the documented
 * single-frame format and is exercised by the unit tests.
 *
 * NOT YET VALIDATED: multi-frame responses (more than three DTCs), where CAN
 * ISO-TP framing and a possible DTC-count byte change the byte layout. Some
 * stacks (e.g. python-OBD) strip a count byte after 0x43; whether the target
 * adapter/vehicle emits one is unconfirmed until the physical Mode 03 check in
 * docs/STEP_18_PHYSICAL_TEST.md is run with more than three stored codes. Do
 * not widen this decoder to strip a count byte without that real evidence — it
 * would corrupt the common single-frame case.
 */
export function decodeMode03Response(
  response: string
): DecodedDtcResult {
  const bytes = parseHexBytes(response)

  if (bytes.length < 1) {
    throw new Error(
      'Empty Mode 03 response'
    )
  }

  if (bytes[0] !== 0x43) {
    throw new Error(
      'Expected Mode 03 response'
    )
  }

  const dtcs: string[] = []

  for (
    let index = 1;
    index + 1 < bytes.length;
    index += 2
  ) {
    const firstByte = bytes[index]!
    const secondByte = bytes[index + 1]!

    // 00 00 = hueco vacío / sin DTC
    if (
      firstByte === 0x00
      && secondByte === 0x00
    ) {
      continue
    }

    dtcs.push(
      decodeDtc(
        firstByte,
        secondByte
      )
    )
  }

  return {
    dtcs
  }
}
