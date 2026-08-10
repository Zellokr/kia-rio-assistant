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
  kind: 'mock' | 'replay' | 'web-serial-rfcomm' | 'android-ble'
  name?: string
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
