/**
 * Base64 codec for the Capacitor BLE byte pipe.
 *
 * Capacitor marshals plugin payloads as JSON, so raw bytes cross the native
 * boundary base64 encoded. ELM traffic is binary-safe in principle (control
 * bytes, and a stray 0x00 from a noisy adapter), so this must not go through
 * any text decoding on the way.
 */

const BASE64_ALPHABET
  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] as number
    const b = bytes[index + 1]
    const c = bytes[index + 2]

    out += BASE64_ALPHABET[a >> 2]
    out += BASE64_ALPHABET[((a & 0b11) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined
      ? '='
      : BASE64_ALPHABET[((b & 0b1111) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : BASE64_ALPHABET[c & 0b111111]
  }

  return out
}

export function base64ToBytes(encoded: string): Uint8Array {
  const clean = encoded.replace(/=+$/, '')
  const bytes = new Uint8Array((clean.length * 3) >> 2)
  let offset = 0
  let buffer = 0
  let bits = 0

  for (const character of clean) {
    const value = BASE64_ALPHABET.indexOf(character)

    if (value < 0) {
      throw new Error(`Invalid base64 character "${character}" in BLE payload`)
    }

    buffer = (buffer << 6) | value
    bits += 6

    if (bits >= 8) {
      bits -= 8
      bytes[offset++] = (buffer >> bits) & 0xff
    }
  }

  return bytes
}
