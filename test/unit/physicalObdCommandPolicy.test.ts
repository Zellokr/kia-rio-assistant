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
