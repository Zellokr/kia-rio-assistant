import {
  describe,
  expect,
  it
} from 'vitest'

import { parseHexBytes } from '../../core/obd/decoder/parseHexBytes'

describe('parseHexBytes', () => {
  it('parses space-separated hex', () => {
    expect(
      parseHexBytes('41 0C 1A F8')
    ).toEqual([0x41, 0x0C, 0x1A, 0xF8])
  })

  it('parses unspaced/concatenated hex', () => {
    expect(
      parseHexBytes('410C1AF8')
    ).toEqual([0x41, 0x0C, 0x1A, 0xF8])
  })

  it('parses irregular/mixed whitespace', () => {
    expect(
      parseHexBytes('41  0C1A F8')
    ).toEqual([0x41, 0x0C, 0x1A, 0xF8])
  })

  it('parses partially spaced hex', () => {
    expect(
      parseHexBytes('4100BE 3FA813')
    ).toEqual([0x41, 0x00, 0xBE, 0x3F, 0xA8, 0x13])
  })

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(parseHexBytes('')).toEqual([])
    expect(parseHexBytes('   ')).toEqual([])
  })

  it('throws on non-hex characters', () => {
    expect(() => {
      parseHexBytes('41 XX 1A F8')
    }).toThrow()
  })

  it('throws on an odd number of hex digits', () => {
    expect(() => {
      parseHexBytes('41 0')
    }).toThrow()
  })
})
