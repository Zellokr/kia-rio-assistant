import {
  decodeDtcResponse
} from '../decoder/decodeDtcResponse'
import type {
  DtcModeDescriptor
} from '../decoder/decodeDtcResponse'
import { ElmResponseError } from '../protocol/ElmResponseError'
import { ElmTimeoutError } from '../protocol/ElmTimeoutError'
import type {
  DtcCode,
  DtcState
} from '../dtc/DtcCode'

/**
 * The slice of `ElmCommandExecutor` this use case needs. Depending on the
 * capability instead of the class keeps the use case pure and testable
 * without a transport.
 */
export interface DtcCommandExecutor {
  execute: (command: string) => Promise<{ normalizedText: string }>
}

export type DtcReadOutcome
  = | {
    readonly kind: 'codes'
    readonly state: DtcState
    readonly codes: readonly DtcCode[]
    readonly complete: boolean
    readonly incompleteReason?:
      | 'unvalidated-multi-frame'
      | 'trailing-odd-byte'
  }
  | {
    /** The ECU answered a padded frame with no codes in it. */
    readonly kind: 'no-codes-reported'
    readonly state: DtcState
  }
  | {
    /** Nothing can be claimed about this mode — NOT a verified zero. */
    readonly kind: 'unconfirmed'
    readonly state: DtcState
    readonly reason: 'no-data' | 'unsupported-mode'
  }
  | {
    readonly kind: 'failed'
    readonly state: DtcState
    readonly reason: 'timeout' | 'transport' | 'protocol'
  }

/**
 * Reads diagnostic trouble codes for one SAE J1979 mode.
 *
 * This is where the Mode 07/0A empty-result ambiguity is resolved, and it is
 * resolved HERE on purpose. `classifyElmResponse` treats `NO DATA` as an
 * error for every command globally; loosening it would weaken error handling
 * for every other command in the app. Only this use case knows which mode was
 * sent, so only it can decide what an error means for that mode.
 *
 * The distinction it protects is the honest one: a padded response frame is
 * the vehicle reporting zero codes (`no-codes-reported`), while a `NO DATA`
 * rejection means the vehicle said nothing at all (`unconfirmed`). Which of
 * the two a real Kia Rio produces for $07 and $0A is NOT known — see check 2
 * of docs/DTC_PHYSICAL_VALIDATION.md, still OPEN and NOT RUN. Both branches
 * ship implemented, so whichever the vehicle does, the reported result is
 * already correct and no user is ever told "no pending codes" on the strength
 * of silence.
 */
export async function readDiagnosticCodes(
  executor: DtcCommandExecutor,
  mode: DtcModeDescriptor
): Promise<DtcReadOutcome> {
  let normalizedText: string

  try {
    const result = await executor.execute(mode.command)

    normalizedText = result.normalizedText
  } catch (error) {
    return mapRejection(error, mode.state)
  }

  return decodeOutcome(normalizedText, mode)
}

function decodeOutcome(
  normalizedText: string,
  mode: DtcModeDescriptor
): DtcReadOutcome {
  let decoded

  try {
    decoded = decodeDtcResponse(normalizedText, mode)
  } catch {
    // The frame did not carry this mode's leading byte, or carried nothing
    // at all. That is a framing problem, not an absence of codes.
    return {
      kind: 'failed',
      state: mode.state,
      reason: 'protocol'
    }
  }

  if (decoded.kind === 'incomplete') {
    return {
      kind: 'codes',
      state: decoded.state,
      codes: decoded.codes,
      complete: false,
      incompleteReason: decoded.reason
    }
  }

  if (decoded.codes.length === 0) {
    return {
      kind: 'no-codes-reported',
      state: decoded.state
    }
  }

  return {
    kind: 'codes',
    state: decoded.state,
    codes: decoded.codes,
    complete: true
  }
}

function mapRejection(
  error: unknown,
  state: DtcState
): DtcReadOutcome {
  if (error instanceof ElmTimeoutError) {
    return {
      kind: 'failed',
      state,
      reason: 'timeout'
    }
  }

  if (error instanceof ElmResponseError) {
    switch (error.responseKind) {
      case 'no-data':
        return {
          kind: 'unconfirmed',
          state,
          reason: 'no-data'
        }
      case 'unknown-command':
        return {
          kind: 'unconfirmed',
          state,
          reason: 'unsupported-mode'
        }
      case 'unable-to-connect':
        return {
          kind: 'failed',
          state,
          reason: 'transport'
        }
      default:
        return {
          kind: 'failed',
          state,
          reason: 'protocol'
        }
    }
  }

  // A rejection the protocol layer never classified: a disconnected or
  // failing transport, or a disposed executor.
  return {
    kind: 'failed',
    state,
    reason: 'transport'
  }
}
