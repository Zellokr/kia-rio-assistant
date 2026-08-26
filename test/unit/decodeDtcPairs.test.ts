import {
  describe,
  expect,
  it
} from 'vitest'

import {
  decodeDtcPairs
} from '../../core/obd/decoder/decodeDtcPairs'
import {
  parseHexBytes
} from '../../core/obd/decoder/parseHexBytes'

// Every case below is carried over verbatim from the retired
// test/unit/decodeModel03Response.test.ts (see docs/DTC_PHYSICAL_VALIDATION.md
// check 1 for why the retired decoder's scope mattered). Only the leading
// response byte (e.g. 0x43) is dropped from each input, since this decoder
// is mode-agnostic and operates on the data bytes only.
describe('decodeDtcPairs', () => {
  it('skips an empty (00 00) slot', () => {
    const codes = decodeDtcPairs(
      parseHexBytes('00 00 00 00 00 00')
    )

    expect(codes).toEqual([])
  })

  it('decodes P0300', () => {
    const codes = decodeDtcPairs(
      parseHexBytes('03 00 00 00')
    )

    expect(codes).toEqual([
      { code: 'P0300', system: 'P', type: 'generic' }
    ])
  })

  it('decodes P0420', () => {
    const codes = decodeDtcPairs(
      parseHexBytes('04 20 00 00')
    )

    expect(codes).toEqual([
      { code: 'P0420', system: 'P', type: 'generic' }
    ])
  })

  it('decodes several DTCs', () => {
    const codes = decodeDtcPairs(
      parseHexBytes('03 00 04 20 00 00')
    )

    expect(codes).toEqual([
      { code: 'P0300', system: 'P', type: 'generic' },
      { code: 'P0420', system: 'P', type: 'generic' }
    ])
  })

  it('decodes unspaced data bytes correctly', () => {
    const codes = decodeDtcPairs(
      parseHexBytes('030004200000')
    )

    expect(codes).toEqual([
      { code: 'P0300', system: 'P', type: 'generic' },
      { code: 'P0420', system: 'P', type: 'generic' }
    ])
  })

  // Regression lock for the validated envelope: a single-frame SAE J1979
  // response carries up to three DTC pairs with no DTC count byte (per the
  // ISO 15765-4 single-frame format). This is the exact worked example from
  // the SAE J1979 Service 03 documentation.
  it('decodes three DTCs from a single-frame response with no count byte', () => {
    const codes = decodeDtcPairs(
      parseHexBytes('01 43 01 96 02 34')
    )

    expect(codes).toEqual([
      { code: 'P0143', system: 'P', type: 'generic' },
      { code: 'P0196', system: 'P', type: 'generic' },
      { code: 'P0234', system: 'P', type: 'generic' }
    ])
  })

  it('decodes a full type across P, C, B and U systems', () => {
    const codes = decodeDtcPairs(
      parseHexBytes('03 00 43 00 83 00 C3 00')
    )

    expect(codes).toEqual([
      { code: 'P0300', system: 'P', type: 'generic' },
      { code: 'C0300', system: 'C', type: 'generic' },
      { code: 'B0300', system: 'B', type: 'generic' },
      { code: 'U0300', system: 'U', type: 'generic' }
    ])
  })
})
