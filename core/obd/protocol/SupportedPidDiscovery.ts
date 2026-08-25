import type {
  ElmCommandExecutor,
  ElmCommandResult
} from './ElmCommandExecutor'

import {
  decodeSupportedPids
} from '../decoder/decodeSupportedPids'
import {
  PhysicalCommandRejectedError
} from '../policy/PhysicalObdCommandPolicy'

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
  /**
   * Present when a capability frame could not be decoded (a truncated or
   * garbled response from a marginal link). Discovery stops at that range and
   * returns what it already gathered instead of aborting the whole session.
   */
  decodeError?: {
    command: string
    message: string
  }
}

export interface DiscoverSupportedPidsOptions {
  timeoutMs?: number
  initialTimeoutMs?: number
  seed?: SupportedPidRange
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
  executor: ElmCommandExecutor,
  options?: DiscoverSupportedPidsOptions
): Promise<SupportedPidDiscoveryResult> {
  const ranges: SupportedPidRange[] = []
  const allPids = new Set<string>()

  if (options?.seed) {
    ranges.push(options.seed)
    options.seed.pids.forEach(pid => allPids.add(pid))
    if (!options.seed.hasNextRange) return { pids: [...allPids], ranges }
  }

  for (const basePid of PID_RANGE_BASES) {
    if (basePid === 0x00 && options?.seed) continue
    const command = createSupportedPidCommand(
      basePid
    )

    const isFirstRange = basePid === PID_RANGE_BASES[0]
    const timeoutMs = isFirstRange
      ? options?.initialTimeoutMs ?? 7000
      : options?.timeoutMs ?? 3000

    let response: ElmCommandResult

    try {
      response = await executor.execute(
        command,
        timeoutMs
      )
    } catch (error) {
      // The physical read-only policy only allows the base range (0100).
      // A vehicle advertising further ranges must not fail the whole
      // session — stop discovery with whatever ranges were already read.
      if (error instanceof PhysicalCommandRejectedError) {
        break
      }

      throw error
    }

    let decoded

    try {
      decoded = decodeSupportedPids(
        response.normalizedText
      )
    } catch (error) {
      // A garbled or truncated capability frame must not abort the whole
      // connect. Stop discovery and report what was already gathered so the
      // session can still reach ready for manual reads and DTCs.
      return {
        pids: [...allPids],
        ranges,
        decodeError: {
          command,
          message: error instanceof Error
            ? error.message
            : String(error)
        }
      }
    }

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
