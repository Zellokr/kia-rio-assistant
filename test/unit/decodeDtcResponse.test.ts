import {
  describe,
  expect,
  it
} from 'vitest'

import {
  DTC_MODES,
  decodeDtcResponse
} from '../../core/obd/decoder/decodeDtcResponse'

describe('decodeDtcResponse', () => {
  describe('mode table', () => {
    it('decodes a Mode 03 (stored) response with state "stored"', () => {
      const result = decodeDtcResponse(
        '43 03 00 04 20 00 00',
        DTC_MODES.stored
      )

      expect(result).toEqual({
        kind: 'complete',
        state: 'stored',
        codes: [
          { code: 'P0300', system: 'P', type: 'generic' },
          { code: 'P0420', system: 'P', type: 'generic' }
        ]
      })
    })

    it('decodes a Mode 07 (pending) response with state "pending"', () => {
      const result = decodeDtcResponse(
        '47 03 00 00 00',
        DTC_MODES.pending
      )

      expect(result).toEqual({
        kind: 'complete',
        state: 'pending',
        codes: [
          { code: 'P0300', system: 'P', type: 'generic' }
        ]
      })
    })

    it('decodes a Mode 0A (permanent) response with state "permanent"', () => {
      const result = decodeDtcResponse(
        '4A 04 20 00 00',
        DTC_MODES.permanent
      )

      expect(result).toEqual({
        kind: 'complete',
        state: 'permanent',
        codes: [
          { code: 'P0420', system: 'P', type: 'generic' }
        ]
      })
    })

    it('rejects a response whose leading byte does not match the requested mode', () => {
      expect(() => {
        decodeDtcResponse(
          '41 0C 1A F8',
          DTC_MODES.stored
        )
      }).toThrow(
        'Expected Mode 03 response'
      )
    })

    it('rejects an empty response', () => {
      expect(() => {
        decodeDtcResponse(
          '',
          DTC_MODES.stored
        )
      }).toThrow(
        'Empty Mode 03 response'
      )
    })
  })

  describe('incomplete: trailing-odd-byte', () => {
    it('flags a response whose data bytes cannot form full pairs', () => {
      const result = decodeDtcResponse(
        '43 03 00 04',
        DTC_MODES.stored
      )

      expect(result).toEqual({
        kind: 'incomplete',
        state: 'stored',
        reason: 'trailing-odd-byte',
        rawByteCount: 4,
        codes: [
          { code: 'P0300', system: 'P', type: 'generic' }
        ]
      })
    })
  })

  describe('incomplete: unvalidated-multi-frame', () => {
    it('flags a response with more than the validated 3 DTC pairs, without discarding any of them', () => {
      const result = decodeDtcResponse(
        '43 03 00 03 00 03 00 03 00',
        DTC_MODES.stored
      )

      expect(result).toEqual({
        kind: 'incomplete',
        state: 'stored',
        reason: 'unvalidated-multi-frame',
        rawByteCount: 9,
        codes: [
          { code: 'P0300', system: 'P', type: 'generic' },
          { code: 'P0300', system: 'P', type: 'generic' },
          { code: 'P0300', system: 'P', type: 'generic' },
          { code: 'P0300', system: 'P', type: 'generic' }
        ]
      })
    })

    it('accepts exactly 3 pairs as the validated boundary (complete, not incomplete)', () => {
      const result = decodeDtcResponse(
        '43 01 43 01 96 02 34',
        DTC_MODES.stored
      )

      expect(result.kind).toBe('complete')
    })
  })

  // Regression lock: docs/DTC_PHYSICAL_VALIDATION.md check 1 is OPEN and
  // NOT RUN. Whether the real adapter/vehicle emits a leading DTC-count byte
  // on a multi-frame response is unconfirmed. This decoder must NEVER guess
  // and strip one. Proof: a response shaped like "leading byte, then a
  // count byte, then real DTC pairs" is decoded as-is, byte for byte,
  // instead of being reinterpreted as if the count byte were absent. If a
  // future change makes this test expect a clean P0143/P0196 pair here, that
  // change silently started stripping a count byte without the physical
  // evidence check 1 requires — do not "fix" this test without running it.
  it('does NOT strip a count-byte-shaped leading data byte', () => {
    // If a count byte were stripped, "02" would be dropped and this would
    // decode cleanly to P0143, P0196. It must not.
    const result = decodeDtcResponse(
      '43 02 01 43 01 96',
      DTC_MODES.stored
    )

    expect(result).toEqual({
      kind: 'incomplete',
      state: 'stored',
      reason: 'trailing-odd-byte',
      rawByteCount: 6,
      codes: [
        { code: 'P0201', system: 'P', type: 'generic' },
        { code: 'C0301', system: 'C', type: 'generic' }
      ]
    })
  })
})
