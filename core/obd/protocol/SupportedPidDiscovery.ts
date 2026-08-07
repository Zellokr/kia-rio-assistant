import type {
  ElmCommandExecutor,
  ElmCommandResult
} from './ElmCommandExecutor'

import {
  decodeSupportedPids
} from '../decoder/decodeSupportedPids'

export interface SupportedPidRange {
  command: string
  response: ElmCommandResult
  rangeStart: number
  rangeEnd: number
  pids: string[]
  hasNextRange: boolean
}

export interface SupportedPidDiscoveryResult {
  pids: string[]
  ranges: SupportedPidRange[]
}

const PID_RANGE_BASES = [
  0x00,
  0x20,
  0x40,
  0x60,
  0x80,
  0xA0,
  0xC0
] as const

function createSupportedPidCommand(
  basePid: number
): string {
  return `01${basePid
    .toString(16)
    .toUpperCase()
    .padStart(2, '0')}`
}

export async function discoverSupportedPids(
  executor: ElmCommandExecutor
): Promise<SupportedPidDiscoveryResult> {
  const ranges: SupportedPidRange[] = []
  const allPids = new Set<string>()

  for (const basePid of PID_RANGE_BASES) {
    const command = createSupportedPidCommand(
      basePid
    )

    const response = await executor.execute(
      command,
      3000
    )

    const decoded = decodeSupportedPids(
      response.normalizedText
    )

    for (const pid of decoded.pids) {
      allPids.add(pid)
    }

    ranges.push({
      command,
      response,
      rangeStart: decoded.rangeStart,
      rangeEnd: decoded.rangeEnd,
      pids: decoded.pids,
      hasNextRange: decoded.hasNextRange
    })

    if (!decoded.hasNextRange) {
      break
    }
  }

  return {
    pids: [...allPids],
    ranges
  }
}
