import {
  describe,
  expect,
  it
} from 'vitest'

import {
  parseDtcCode
} from '../../core/obd/dtc/DtcCode'

describe('parseDtcCode', () => {
  it('parses a generic Powertrain code', () => {
    const code = parseDtcCode('P0300')

    expect(code).toEqual({
      code: 'P0300',
      system: 'P',
      type: 'generic'
    })
  })

  it('parses a manufacturer-specific Powertrain code', () => {
    const code = parseDtcCode('P1300')

    expect(code).toEqual({
      code: 'P1300',
      system: 'P',
      type: 'manufacturer'
    })
  })

  it('parses a Chassis code', () => {
    const code = parseDtcCode('C0300')

    expect(code).toEqual({
      code: 'C0300',
      system: 'C',
      type: 'generic'
    })
  })

  it('parses a Body code', () => {
    const code = parseDtcCode('B0300')

    expect(code).toEqual({
      code: 'B0300',
      system: 'B',
      type: 'generic'
    })
  })

  it('parses a Network code', () => {
    const code = parseDtcCode('U0300')

    expect(code).toEqual({
      code: 'U0300',
      system: 'U',
      type: 'generic'
    })
  })

  it('normalizes lowercase input', () => {
    const code = parseDtcCode('p0420')

    expect(code).toEqual({
      code: 'P0420',
      system: 'P',
      type: 'generic'
    })
  })

  it('classifies Powertrain digits 0 and 2 as generic, 1 as manufacturer', () => {
    expect(parseDtcCode('P0300').type).toBe('generic')
    expect(parseDtcCode('P2300').type).toBe('generic')
    expect(parseDtcCode('P1300').type).toBe('manufacturer')
  })

  it('splits Powertrain digit 3 at P3400, per SAE J2012', () => {
    expect(parseDtcCode('P3000').type).toBe('manufacturer')
    expect(parseDtcCode('P3399').type).toBe('manufacturer')
    expect(parseDtcCode('P3400').type).toBe('generic')
    expect(parseDtcCode('P3999').type).toBe('generic')
  })

  it('treats Chassis, Body and Network digit 2 as manufacturer, not generic', () => {
    // The Powertrain rule does NOT carry over: for B/C/U, both 1 and 2 are
    // manufacturer-specific. Classifying digit 2 as generic here would
    // mislabel every manufacturer chassis, body and network code.
    for (const system of ['B', 'C', 'U']) {
      expect(parseDtcCode(`${system}1300`).type).toBe('manufacturer')
      expect(parseDtcCode(`${system}2300`).type).toBe('manufacturer')
    }
  })

  it('treats Chassis, Body and Network digit 0 and 3 as generic', () => {
    // 0 is SAE-defined and 3 is SAE-reserved — neither is delegated to the
    // manufacturer.
    for (const system of ['B', 'C', 'U']) {
      expect(parseDtcCode(`${system}0300`).type).toBe('generic')
      expect(parseDtcCode(`${system}3300`).type).toBe('generic')
    }
  })

  it('rejects an unknown system letter', () => {
    expect(() => {
      parseDtcCode('X0300')
    }).toThrow(
      'Malformed DTC code'
    )
  })

  it('rejects a code that is too short', () => {
    expect(() => {
      parseDtcCode('P030')
    }).toThrow(
      'Malformed DTC code'
    )
  })

  it('rejects a code that is too long', () => {
    expect(() => {
      parseDtcCode('P03000')
    }).toThrow(
      'Malformed DTC code'
    )
  })

  it('rejects a code with a non-hexadecimal digit', () => {
    expect(() => {
      parseDtcCode('P03G0')
    }).toThrow(
      'Malformed DTC code'
    )
  })

  it('rejects an empty string', () => {
    expect(() => {
      parseDtcCode('')
    }).toThrow(
      'Malformed DTC code'
    )
  })
})
