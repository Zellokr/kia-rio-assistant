export function parseHexBytes(response: string): number[] {
  const stripped = response.replace(/\s+/g, '')

  if (stripped.length === 0) {
    return []
  }

  if (!/^[0-9A-Fa-f]+$/.test(stripped)) {
    throw new Error(`Invalid OBD hex data: ${response.trim()}`)
  }

  if (stripped.length % 2 !== 0) {
    throw new Error(`Invalid OBD hex data length: ${response.trim()}`)
  }

  const bytes: number[] = []

  for (let i = 0; i < stripped.length; i += 2) {
    bytes.push(Number.parseInt(stripped.slice(i, i + 2), 16))
  }

  return bytes
}
