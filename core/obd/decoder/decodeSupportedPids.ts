import { parseHexBytes } from './parseHexBytes'

export interface SupportedPidResult {
  rangeStart: number
  rangeEnd: number
  pids: string[]
  hasNextRange: boolean
}

export function decodeSupportedPids(
  response: string
): SupportedPidResult {
  const bytes = parseHexBytes(response)

  if (bytes.length < 6) {
    throw new Error(
      'Incomplete supported PIDs response'
    )
  }

  if (bytes[0] !== 0x41) {
    throw new Error(
      'Expected Mode 01 response'
    )
  }

  const basePid = bytes[1]!

  if (
    basePid !== 0x00
    && basePid !== 0x20
    && basePid !== 0x40
    && basePid !== 0x60
    && basePid !== 0x80
    && basePid !== 0xA0
    && basePid !== 0xC0
  ) {
    throw new Error(
      `Unsupported PID range: ${basePid.toString(16)}`
    )
  }

  const data = bytes.slice(2, 6)

  const pids: string[] = []

  for (let bitIndex = 0; bitIndex < 32; bitIndex++) {
    const byteIndex = Math.floor(bitIndex / 8)

    const bitInByte = 7 - (bitIndex % 8)

    const supported
      = (data[byteIndex]! & (1 << bitInByte)) !== 0

    if (!supported) {
      continue
    }

    const pid = basePid + bitIndex + 1

    pids.push(
      pid
        .toString(16)
        .toUpperCase()
        .padStart(2, '0')
    )
  }

  return {
    rangeStart: basePid + 1,
    rangeEnd: basePid + 0x20,
    pids,
    hasNextRange: pids.includes(
      (basePid + 0x20)
        .toString(16)
        .toUpperCase()
        .padStart(2, '0')
    )
  }
}
