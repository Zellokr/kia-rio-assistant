import {
  describe,
  expect,
  it
} from 'vitest'

import { decodeSupportedPids } from '../../core/obd/decoder/decodeSupportedPids'

describe('decodeSupportedPids', () => {
  it('decodes supported PIDs from 0100', () => {
    const result = decodeSupportedPids(
      '41 00 BE 3F A8 13'
    )

    expect(result.rangeStart).toBe(0x01)
    expect(result.rangeEnd).toBe(0x20)

    expect(result.pids).toContain('05')
    expect(result.pids).toContain('0C')
  })

  it('detects whether another PID range exists', () => {
    const result = decodeSupportedPids(
      '41 00 BE 3F A8 13'
    )

    expect(
      typeof result.hasNextRange
    ).toBe('boolean')
  })

  it('rejects incomplete responses', () => {
    expect(() => {
      decodeSupportedPids(
        '41 00 BE 3F'
      )
    }).toThrow(
      'Incomplete supported PIDs response'
    )
  })

  it('rejects invalid hexadecimal bytes', () => {
    expect(() => {
      decodeSupportedPids(
        '41 00 BE XX A8 13'
      )
    }).toThrow()
  })
  it('decodes the 21-40 PID range', () => {
    const result = decodeSupportedPids(
      '41 20 80 00 00 00'
    )

    expect(result.rangeStart).toBe(0x21)
    expect(result.rangeEnd).toBe(0x40)

    expect(result.pids).toContain('21')
    expect(result.hasNextRange).toBe(false)
  })
})
