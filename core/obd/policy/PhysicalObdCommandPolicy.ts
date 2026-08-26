/**
 * Step 19 physical read-only safety boundary.
 *
 * This is the single source of truth for which ELM327/OBD-II commands may
 * reach a real vehicle. It must be enforced below the UI, at the transport
 * boundary, so no caller (manual command, initialization, PID discovery,
 * telemetry polling, or a future reconnection path) can bypass it by
 * skipping a disabled button or a form validator.
 *
 * Mode 04 (clear DTCs / freeze frame) is excluded on purpose and must never
 * be added: this lab is read-only and must never write to the ECU.
 */
export const PHYSICAL_ALLOWED_COMMANDS = [
  'ATZ',
  'ATE0',
  'ATL0',
  'ATS0',
  'ATH0',
  'ATSP0',
  // Mode 01 capability probes. Discovery walks every range, so approving only
  // `0100` stopped it at PID 0x20 against a real vehicle on 2026-08-24. These
  // return support bitmasks and write nothing; the walk must not end at an
  // arbitrary range that was never a deliberate safety boundary.
  '0100',
  '0120',
  '0140',
  '0160',
  '0180',
  '01A0',
  '01C0',
  '010C',
  '0105',
  // The three SAE J1979 DTC reads. All three are pure reads: they return
  // stored ($03), pending ($07) and permanent ($0A) codes and write nothing.
  // Mode 04 (clear) is NOT here and never will be. Whether a vehicle answers
  // $07/$0A with a padded frame or with `NO DATA` is unconfirmed — see check 2
  // of docs/DTC_PHYSICAL_VALIDATION.md — which is a decoding question, not a
  // safety one: sending them cannot modify the ECU.
  '03',
  '07',
  '0A'
] as const

export type PhysicalAllowedCommand
  = (typeof PHYSICAL_ALLOWED_COMMANDS)[number]

const ALLOWED_COMMAND_SET = new Set<string>(
  PHYSICAL_ALLOWED_COMMANDS
)

const MODE_04_PREFIX = '04'

function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, '').toUpperCase()
}

export function isPhysicalCommandAllowed(
  command: string
): boolean {
  const normalized = normalizeCommand(command)

  if (normalized.startsWith(MODE_04_PREFIX)) {
    return false
  }

  return ALLOWED_COMMAND_SET.has(normalized)
}

export class PhysicalCommandRejectedError extends Error {
  constructor(readonly command: string) {
    super(
      `Physical command "${command}" is not allowed on this read-only transport`
    )
    this.name = 'PhysicalCommandRejectedError'
  }
}

export function assertPhysicalCommandAllowed(
  command: string
): void {
  if (!isPhysicalCommandAllowed(command)) {
    throw new PhysicalCommandRejectedError(command)
  }
}
