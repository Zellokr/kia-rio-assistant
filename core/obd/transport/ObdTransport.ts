export type ObdTransportState
  = | 'idle'
    | 'selecting'
    | 'selected'
    | 'connecting'
    | 'connected'
    | 'disconnecting'
    | 'disconnected'
    | 'error'

export interface ObdTransportMetadata {
  kind: 'mock' | 'replay' | 'android-ble'
  name?: string
}

/**
 * Transports whose bytes reach real hardware.
 *
 * This is the single predicate every physical safety gate keys on: the command
 * allowlist offered in the UI, the write guard, and physical-only telemetry
 * tasks. Keeping it in one place is deliberate — the same check was previously
 * spelled out at each call site, and one of them had already drifted out of
 * sync with the others.
 */
export const PHYSICAL_TRANSPORT_KINDS = [
  'android-ble'
] as const satisfies readonly ObdTransportMetadata['kind'][]

export function isPhysicalTransportKind(
  kind: ObdTransportMetadata['kind']
): boolean {
  return (PHYSICAL_TRANSPORT_KINDS as readonly string[]).includes(kind)
}

export interface ObdTransport {
  readonly kind: ObdTransportMetadata['kind']
  readonly state: ObdTransportState

  select(): Promise<ObdTransportMetadata>
  connect(): Promise<ObdTransportMetadata>
  disconnect(): Promise<void>

  write(data: Uint8Array): Promise<void>

  subscribe(
    listener: (data: Uint8Array) => void,
  ): () => void

  /**
   * Notifies listeners whenever `state` changes. Used by ElmCommandExecutor
   * to fail in-flight commands immediately on disconnect/error instead of
   * waiting for the per-command timeout.
   */
  subscribeState(
    listener: (state: ObdTransportState) => void,
  ): () => void
}

export function isObdTransportUnavailable(
  state: ObdTransportState
): boolean {
  return state === 'disconnecting'
    || state === 'disconnected'
    || state === 'error'
}
