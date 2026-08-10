import {
  describe,
  expect,
  it
} from 'vitest'

import { decodeMode01Response } from '../../core/obd/decoder/decodeMode01Response'

describe('decodeMode01Response', () => {
  it('decodes engine RPM', () => {
    const result = decodeMode01Response(
      '41 0C 1A F8'
    )

    expect(result).toEqual({
      pid: '010C',
      key: 'engineRpm',
      label: 'RPM del motor',
      value: 1726,
      unit: 'rpm'
    })
  })

  it('decodes coolant temperature', () => {
    const result = decodeMode01Response(
      '41 05 5A'
    )

    expect(result).toEqual({
      pid: '0105',
      key: 'coolantTemperature',
      label: 'Temperatura del refrigerante',
      value: 50,
      unit: '°C'
    })
  })

  it('ignores non Mode 01 responses', () => {
    const result = decodeMode01Response(
      '43 00 00 00 00 00 00'
    )

    expect(result).toBeNull()
  })

  it('ignores unsupported PIDs', () => {
    const result = decodeMode01Response(
      '41 FF 80'
    )

    expect(result).toBeNull()
  })

  it('rejects incomplete RPM responses', () => {
    expect(() => {
      decodeMode01Response(
        '41 0C 1A'
      )
    }).toThrow(
      'Incomplete response for PID 010C'
    )
  })

  it('rejects invalid hexadecimal data', () => {
    expect(() => {
      decodeMode01Response(
        '41 XX 1A F8'
      )
    }).toThrow()
  })

  it('decodes calculated engine load', () => {
    const result = decodeMode01Response(
      '41 04 50'
    )

    expect(result?.pid).toBe('0104')
    expect(result?.key).toBe('engineLoad')
    expect(result?.unit).toBe('%')

    expect(result?.value)
      .toBeCloseTo(31.37, 2)
  })

  it('decodes vehicle speed', () => {
    const result = decodeMode01Response(
      '41 0D 00'
    )

    expect(result).toEqual({
      pid: '010D',
      key: 'vehicleSpeed',
      label: 'Velocidad',
      value: 0,
      unit: 'km/h'
    })
  })

  it('decodes throttle position', () => {
    const result = decodeMode01Response(
      '41 11 20'
    )

    expect(result?.pid).toBe('0111')
    expect(result?.key)
      .toBe('throttlePosition')
    expect(result?.unit).toBe('%')

    expect(result?.value)
      .toBeCloseTo(12.55, 2)
  })

  it('rejects incomplete speed responses', () => {
    expect(() => {
      decodeMode01Response(
        '41 0D'
      )
    }).toThrow(
      'Incomplete response for PID 010D'
    )
  })

  it.each([
    ['41 04', '0104'],
    ['41 05', '0105'],
    ['41 11', '0111']
  ])(
    'rejects incomplete %s responses',
    (response, pid) => {
      expect(() => {
        decodeMode01Response(response)
      }).toThrow(
        `Incomplete response for PID ${pid}`
      )
    }
  )

  it('decodes unspaced hex the same as spaced hex', () => {
    const spaced = decodeMode01Response('41 0C 1A F8')
    const unspaced = decodeMode01Response('410C1AF8')

    expect(unspaced).toEqual(spaced)
  })

  it('decodes mixed/irregular whitespace the same as spaced hex', () => {
    const spaced = decodeMode01Response('41 0C 1A F8')
    const mixed = decodeMode01Response('41  0C1A F8')

    expect(mixed).toEqual(spaced)
  })
})
