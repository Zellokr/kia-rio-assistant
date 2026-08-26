import {
  parseDtcCode
} from '../dtc/DtcCode'
import type {
  DtcCode
} from '../dtc/DtcCode'

const DTC_SYSTEM_LETTERS = [
  'P',
  'C',
  'B',
  'U'
] as const

function buildDtcCodeString(
  firstByte: number,
  secondByte: number
): string {
  const systemBits = (firstByte & 0xC0) >> 6
  const system = DTC_SYSTEM_LETTERS[systemBits]

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
 * Decodes consecutive 2-byte DTC pairs, per SAE J1979 / ISO 15031-6.
 *
 * This is a pure per-pair decoder: it has no knowledge of which mode ($03,
 * $07, $0A) produced these bytes, expects no leading response byte, and does
 * NO framing validation. It decodes exactly the bytes it is given, in order,
 * skipping a padded `00 00` empty slot. A trailing byte that cannot form a
 * full pair is silently ignored here; a caller that needs to detect that
 * condition (see `decodeDtcResponse`) must check for it itself before
 * calling this function.
 *
 * It never inspects or strips a leading DTC-count byte — that would require
 * knowing whether the source frame carries one, which is unconfirmed; see
 * docs/DTC_PHYSICAL_VALIDATION.md check 1.
 */
export function decodeDtcPairs(
  bytes: readonly number[]
): readonly DtcCode[] {
  const codes: DtcCode[] = []

  for (
    let index = 0;
    index + 1 < bytes.length;
    index += 2
  ) {
    const firstByte = bytes[index]!
    const secondByte = bytes[index + 1]!

    // 00 00 = empty slot / no DTC in this position
    if (
      firstByte === 0x00
      && secondByte === 0x00
    ) {
      continue
    }

    codes.push(
      parseDtcCode(
        buildDtcCodeString(
          firstByte,
          secondByte
        )
      )
    )
  }

  return codes
}
