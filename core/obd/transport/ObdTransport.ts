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
  kind: 'mock' | 'web-serial-rfcomm'
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
}
