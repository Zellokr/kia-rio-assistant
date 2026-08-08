import type {
  ObdTransport,
  ObdTransportMetadata,
  ObdTransportState
} from './ObdTransport'

export class MockObdTransport implements ObdTransport {
  readonly kind = 'mock' as const

  state: ObdTransportState = 'idle'

  private listeners = new Set<(data: Uint8Array) => void>()

  async select(): Promise<ObdTransportMetadata> {
    this.state = 'selecting'

    await this.delay(200)

    this.state = 'selected'

    return {
      kind: this.kind,
      name: 'Mock ELM327'
    }
  }

  async connect(): Promise<ObdTransportMetadata> {
    this.state = 'connecting'

    await this.delay(300)

    this.state = 'connected'

    return {
      kind: this.kind,
      name: 'Mock ELM327'
    }
  }

  async disconnect(): Promise<void> {
    this.state = 'disconnecting'

    await this.delay(150)

    this.state = 'disconnected'
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.state !== 'connected') {
      throw new Error('OBD transport is not connected')
    }

    const command = new TextDecoder()
      .decode(data)
      .trim()
      .toUpperCase()

    await this.delay(150)

    const response = this.getResponse(command)

    if (command === '0198') {
      // Simula un adaptador que no responde.
      await this.delay(100)
      return
    }
    if (command === '010C') {
      const fragments = [
        '41 0',
        'C 1A',
        ' F8\r>'
      ]

      for (const fragment of fragments) {
        await this.delay(60)

        this.emit(
          new TextEncoder().encode(fragment)
        )
      }

      return
    }

    this.emit(
      new TextEncoder().encode(response)
    )
  }

  subscribe(
    listener: (data: Uint8Array) => void
  ): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(data: Uint8Array) {
    for (const listener of this.listeners) {
      listener(data)
    }
  }

  private getResponse(command: string): string {
    const responses: Record<string, string> = {
      'ATZ': 'ELM327 v1.5\r>',
      'ATE0': 'OK\r>',
      'ATL0': 'OK\r>',
      'ATS0': 'OK\r>',
      'ATH0': 'OK\r>',
      'ATSP0': 'OK\r>',

      '0100': '41 00 BE 3F A8 13\r>',
      '0120': '41 20 80 00 00 00\r>',

      '0104': '41 04 50\r>',
      '0105': '41 05 5A\r>',
      '010C': '41 0C 1A F8\r>',
      '010D': '41 0D 00\r>',
      '0111': '41 11 20\r>',

      '03': '43 00 00 00 00 00 00\r>',
      '03TEST': '43 03 00 04 20 00 00\r>'
    }

    return responses[command] ?? 'NO DATA\r>'
  }

  private delay(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
