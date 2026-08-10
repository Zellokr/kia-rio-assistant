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
  '0100',
  '010C',
  '0105',
  '03'
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
