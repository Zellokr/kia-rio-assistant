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
})
