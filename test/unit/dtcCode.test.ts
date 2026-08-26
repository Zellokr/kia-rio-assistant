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

  it('classifies type digit 2 as generic and digit 3 as manufacturer', () => {
    expect(parseDtcCode('P2300').type).toBe('generic')
    expect(parseDtcCode('P3300').type).toBe('manufacturer')
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
