import {
  describe,
  expect,
  it
} from 'vitest'

import {
  isPhysicalCommandAllowed,
  assertPhysicalCommandAllowed,
  PhysicalCommandRejectedError,
  PHYSICAL_ALLOWED_COMMANDS
} from '../../core/obd/policy/PhysicalObdCommandPolicy'

describe('PhysicalObdCommandPolicy', () => {
  it.each(PHYSICAL_ALLOWED_COMMANDS)(
    'allows the approved Step 19 command %s',
    (command) => {
      expect(isPhysicalCommandAllowed(command)).toBe(true)
      expect(() => {
        assertPhysicalCommandAllowed(command)
      }).not.toThrow()
    }
  )

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(isPhysicalCommandAllowed(' atz ')).toBe(true)
    expect(isPhysicalCommandAllowed('0100')).toBe(true)
    expect(isPhysicalCommandAllowed('0100'.toLowerCase())).toBe(true)
  })

  it('rejects Mode 04 unconditionally', () => {
    expect(isPhysicalCommandAllowed('04')).toBe(false)
    expect(isPhysicalCommandAllowed('0104')).toBe(false)
    expect(isPhysicalCommandAllowed('0100'.replace('01', '04'))).toBe(false)

    expect(() => {
      assertPhysicalCommandAllowed('04')
    }).toThrow(PhysicalCommandRejectedError)
  })

  /**
   * Discovery walks every Mode 01 capability range. Allowing only `0100` moved
   * the wall to `0120` and stopped discovery at PID 0x20 on a real vehicle, so
   * the whole probe set is approved together — they are all capability-bitmask
   * reads, and cutting the walk at an arbitrary range was an accident, not a
   * safety boundary.
   */
  it.each(['0100', '0120', '0140', '0160', '0180', '01A0', '01C0'])(
    'allows the capability probe %s so discovery can finish',
    (command) => {
      expect(isPhysicalCommandAllowed(command)).toBe(true)
    }
  )

  it('still rejects a Mode 01 read that is not a capability probe', () => {
    expect(isPhysicalCommandAllowed('0121')).toBe(false)
    expect(isPhysicalCommandAllowed('01E0')).toBe(false)
  })

  it('rejects telemetry PIDs outside the approved set', () => {
    expect(isPhysicalCommandAllowed('010D')).toBe(false)
    expect(isPhysicalCommandAllowed('0111')).toBe(false)
  })

  it('rejects arbitrary or unknown physical commands', () => {
    expect(isPhysicalCommandAllowed('ATRV')).toBe(false)
    expect(isPhysicalCommandAllowed('0902')).toBe(false)
    expect(isPhysicalCommandAllowed('')).toBe(false)

    expect(() => {
      assertPhysicalCommandAllowed('ATRV')
    }).toThrow(PhysicalCommandRejectedError)
  })

  // Defense-in-depth for the read-only boundary: the allowlist must not be
  // trickable into passing a dangerous command hidden inside an otherwise
  // allowed string. Every one of these must fail closed.
  it('rejects command concatenation that smuggles a second command', () => {
    // A benign command with a Mode 04 (clear DTCs) rider must never pass.
    expect(isPhysicalCommandAllowed('0100\r04')).toBe(false)
    expect(isPhysicalCommandAllowed('0100\n04')).toBe(false)
    expect(isPhysicalCommandAllowed('03\r04')).toBe(false)
    // A leading Mode 04 followed by an allowed command is still Mode 04.
    expect(isPhysicalCommandAllowed('04\r0100')).toBe(false)
    // Any second command at all breaks exact allowlist membership.
    expect(isPhysicalCommandAllowed('0100\r0105')).toBe(false)
  })

  it('rejects Mode 04 obfuscated with whitespace', () => {
    expect(isPhysicalCommandAllowed('0 4')).toBe(false)
    expect(isPhysicalCommandAllowed('\t04\r')).toBe(false)
    expect(isPhysicalCommandAllowed(' 0  4 ')).toBe(false)
  })

  it('fails closed on control-byte-injected commands', () => {
    // NUL is not stripped by whitespace normalization, so an injected control
    // byte makes the string miss the allowlist rather than sneak through.
    expect(isPhysicalCommandAllowed('0100\x00')).toBe(false)
    expect(isPhysicalCommandAllowed('\x000100')).toBe(false)
    expect(isPhysicalCommandAllowed('01\x0000')).toBe(false)
  })

  it('accepts allowed commands regardless of inner spacing', () => {
    expect(isPhysicalCommandAllowed('01 00')).toBe(true)
    expect(isPhysicalCommandAllowed('0 1 0 0')).toBe(true)
    expect(isPhysicalCommandAllowed('AT Z')).toBe(true)
  })
})
