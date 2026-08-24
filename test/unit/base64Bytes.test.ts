import { describe, expect, it } from 'vitest'

import {
  bytesToBase64,
  base64ToBytes
} from '../../core/bluetooth/base64Bytes'

describe('base64Bytes', () => {
  it('round-trips an ELM command', () => {
    const bytes = new TextEncoder().encode('ATZ\r')

    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('round-trips every byte value, including 0x00 and 0xff', () => {
    const bytes = new Uint8Array(256).map((_, index) => index)

    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('encodes to the canonical base64 alphabet', () => {
    expect(bytesToBase64(new TextEncoder().encode('ATZ\r')))
      .toBe('QVRaDQ==')
  })

  it('decodes an empty payload to an empty array', () => {
    expect(base64ToBytes('')).toEqual(new Uint8Array(0))
    expect(bytesToBase64(new Uint8Array(0))).toBe('')
  })

  it('does not corrupt a payload larger than one BLE notification', () => {
    // ELM responses arrive fragmented; a chunk may still exceed the 20-byte
    // default ATT payload once the MTU is negotiated upward.
    const bytes = new TextEncoder().encode('41 0C 1A F8 41 0C 1A F8 41 0C\r>')

    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })
})
