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
      '41 11 80'
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
})
