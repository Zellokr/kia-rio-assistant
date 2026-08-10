import {
  describe,
  expect,
  it
} from 'vitest'

import {
  decodeMode03Response
} from '../../core/obd/decoder/decodeMode03Response'

describe('decodeMode03Response', () => {
  it('detects no stored DTCs', () => {
    const result = decodeMode03Response(
      '43 00 00 00 00 00 00'
    )

    expect(result.dtcs).toEqual([])
  })

  it('decodes P0300', () => {
    const result = decodeMode03Response(
      '43 03 00 00 00'
    )

    expect(result.dtcs).toEqual([
      'P0300'
    ])
  })

  it('decodes P0420', () => {
    const result = decodeMode03Response(
      '43 04 20 00 00'
    )

    expect(result.dtcs).toEqual([
      'P0420'
    ])
  })

  it('decodes several DTCs', () => {
    const result = decodeMode03Response(
      '43 03 00 04 20 00 00'
    )

    expect(result.dtcs).toEqual([
      'P0300',
      'P0420'
    ])
  })

  it('rejects non Mode 03 responses', () => {
    expect(() => {
      decodeMode03Response(
        '41 0C 1A F8'
      )
    }).toThrow(
      'Expected Mode 03 response'
    )
  })

  it('rejects invalid hexadecimal data', () => {
    expect(() => {
      decodeMode03Response(
        '43 XX 00'
      )
    }).toThrow()
  })

  it('decodes unspaced DTCs correctly', () => {
    const result = decodeMode03Response(
      '43030004200000'
    )

    expect(result.dtcs).toEqual([
      'P0300',
      'P0420'
    ])
  })
})
