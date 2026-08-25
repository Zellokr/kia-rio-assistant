import type { ObdTransportMetadata } from '../transport/ObdTransport'

export function buildVehicleFingerprint(
  transport: ObdTransportMetadata,
  range0Response: string
): string {
  const hex = range0Response.replace(/\s/g, '').toUpperCase()
  const range0Mask = hex.startsWith('4100')
    ? hex.slice(4, 12)
    : hex.slice(0, 8)

  return `${transport.kind}:${transport.name?.trim().toLowerCase() ?? ''}:${range0Mask}`
}
