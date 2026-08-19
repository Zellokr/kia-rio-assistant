import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import {
  WebSerialRfcommTransport
} from '../../core/obd/transport/WebSerialRfcommTransport'
import type {
  WebSerialPort,
  WebSerialPortInfo,
  WebSerialProvider,
  WebSerialReader,
  WebSerialWriter
} from '../../core/obd/transport/WebSerialRfcommTransport'

class Deferred<T> {
  readonly promise: Promise<T>

  resolve!: (value: T) => void

  reject!: (reason: unknown) => void

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

class FakeReader implements WebSerialReader {
  readonly reads: Array<Deferred<ReadableStreamReadResult<Uint8Array>>> = []

  cancelCalls = 0

  releaseCalls = 0

  read(): Promise<ReadableStreamReadResult<Uint8Array>> {
    const deferred
      = new Deferred<ReadableStreamReadResult<Uint8Array>>()

    this.reads.push(deferred)
    return deferred.promise
  }

  async cancel(): Promise<void> {
    this.cancelCalls++
    this.reads.at(-1)?.resolve({ done: true, value: undefined })
  }

  releaseLock(): void {
    this.releaseCalls++
  }
}

class FakeWriter implements WebSerialWriter {
  readonly writes: Uint8Array[] = []

  readonly pendingWrites: Array<Deferred<void>> = []

  releaseCalls = 0

  blockWrites = false

  async write(data: Uint8Array): Promise<void> {
    this.writes.push(data.slice())

    if (this.blockWrites) {
      const deferred = new Deferred<void>()

      this.pendingWrites.push(deferred)
      await deferred.promise
    }
  }

  releaseLock(): void {
    this.releaseCalls++
  }
}

class FakePort implements WebSerialPort {
  readonly reader = new FakeReader()

  readonly writer = new FakeWriter()

  readonly openCalls: unknown[] = []

  readonly pendingOpens: Array<Deferred<void>> = []

  blockOpen = false

  closeCalls = 0

  getReaderCalls = 0

  getWriterCalls = 0

  constructor(
    private readonly info: WebSerialPortInfo = {}
  ) {}

  readonly readable = {
    getReader: (): WebSerialReader => {
      this.getReaderCalls++
      return this.reader
    }
  }

  readonly writable = {
    getWriter: (): WebSerialWriter => {
      this.getWriterCalls++
      return this.writer
    }
  }

  async open(options: unknown): Promise<void> {
    this.openCalls.push(options)

    if (this.blockOpen) {
      const deferred = new Deferred<void>()

      this.pendingOpens.push(deferred)
      await deferred.promise
    }
  }

  async close(): Promise<void> {
    this.closeCalls++
  }

  getInfo(): WebSerialPortInfo {
    return this.info
  }
}

function createProvider(port: WebSerialPort) {
  let requestCalls = 0

  const provider: WebSerialProvider = {
    async requestPort() {
      requestCalls++
      return port
    }
  }

  return {
    provider,
    get requestCalls() {
      return requestCalls
    }
  }
}

function connectedTransport(port = new FakePort()) {
  const provider = createProvider(port)
  const transport = new WebSerialRfcommTransport({
    provider: provider.provider,
    isSecureContext: () => true
  })

  return { port, provider, transport }
}

describe('WebSerialRfcommTransport', () => {
  it('fails with actionable errors outside a secure context or without Web Serial', async () => {
    const insecure = new WebSerialRfcommTransport({
      provider: createProvider(new FakePort()).provider,
      isSecureContext: () => false
    })

    await expect(insecure.select()).rejects.toThrow(
      'secure context (HTTPS or localhost)'
    )
    expect(insecure.state).toBe('error')

    const unsupported = new WebSerialRfcommTransport({
      provider: undefined,
      isSecureContext: () => true
    })

    await expect(unsupported.select()).rejects.toThrow(
      'Web Serial is unavailable'
    )
    expect(unsupported.state).toBe('error')
  })

  it('selects one port from a user action and exposes stable metadata', async () => {
    const port = new FakePort({
      bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb'
    })
    const { provider, transport } = connectedTransport(port)

    const metadata = await transport.select()

    expect(provider.requestCalls).toBe(1)
    expect(transport.state).toBe('selected')
    expect(metadata).toEqual({
      kind: 'web-serial-rfcomm',
      name: 'Bluetooth RFCOMM serial adapter'
    })
  })

  it('opens the selected port with conservative ELM327 serial defaults', async () => {
    const { port, transport } = connectedTransport()

    await transport.select()
    await expect(transport.connect()).resolves.toMatchObject({
      kind: 'web-serial-rfcomm'
    })

    expect(transport.state).toBe('connected')
    expect(port.openCalls).toEqual([{
      baudRate: 38400,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferSize: 255,
      flowControl: 'none'
    }])
    expect(port.getReaderCalls).toBe(1)
    expect(port.getWriterCalls).toBe(1)
  })

  it('serializes byte writes through one locked writer', async () => {
    const { port, transport } = connectedTransport()

    await transport.select()
    await transport.connect()
    port.writer.blockWrites = true

    const first = transport.write(
      new TextEncoder().encode('ATZ\r')
    )
    const second = transport.write(
      new TextEncoder().encode('ATE0\r')
    )

    await vi.waitFor(() => {
      expect(port.writer.writes).toHaveLength(1)
    })

    port.writer.pendingWrites[0]?.resolve()
    await first
    await vi.waitFor(() => {
      expect(
        port.writer.writes.map(bytes => new TextDecoder().decode(bytes))
      ).toEqual(['ATZ\r', 'ATE0\r'])
    })

    port.writer.pendingWrites[1]?.resolve()
    await second
    expect(port.getWriterCalls).toBe(1)
  })

  it('rejects a physical command outside the Step 19 allowlist without touching the real writer', async () => {
    const { port, transport } = connectedTransport()

    await transport.select()
    await transport.connect()

    await expect(
      transport.write(new TextEncoder().encode('0104\r'))
    ).rejects.toThrow('not allowed')

    expect(port.writer.writes).toHaveLength(0)
    expect(transport.state).toBe('connected')
  })

  it('rejects Mode 04 even when the transport is otherwise connected and ready', async () => {
    const { port, transport } = connectedTransport()

    await transport.select()
    await transport.connect()

    await expect(
      transport.write(new TextEncoder().encode('04\r'))
    ).rejects.toThrow('not allowed')

    expect(port.writer.writes).toHaveLength(0)
  })

  it('emits fragmented raw reads without decoding them', async () => {
    const { port, transport } = connectedTransport()
    const chunks: number[][] = []

    transport.subscribe(chunk => chunks.push([...chunk]))
    await transport.select()
    await transport.connect()

    port.reader.reads[0]?.resolve({
      done: false,
      value: new Uint8Array([0x34, 0x31])
    })
    await Promise.resolve()
    port.reader.reads[1]?.resolve({
      done: false,
      value: new Uint8Array([0x20, 0x30, 0x43])
    })
    await Promise.resolve()

    expect(chunks).toEqual([
      [0x34, 0x31],
      [0x20, 0x30, 0x43]
    ])
  })

  it('moves to error on unexpected EOF and read failure', async () => {
    const eof = connectedTransport()

    await eof.transport.select()
    await eof.transport.connect()
    eof.port.reader.reads[0]?.resolve({ done: true, value: undefined })
    await Promise.resolve()
    await Promise.resolve()
    expect(eof.transport.state).toBe('error')

    const failed = connectedTransport()

    await failed.transport.select()
    await failed.transport.connect()
    failed.port.reader.reads[0]?.reject(new Error('Bluetooth link lost'))
    await Promise.resolve()
    await Promise.resolve()
    expect(failed.transport.state).toBe('error')
  })

  it('cancels a pending read, releases locks, closes once and disconnects idempotently', async () => {
    const { port, transport } = connectedTransport()

    await transport.select()
    await transport.connect()

    await Promise.all([
      transport.disconnect(),
      transport.disconnect()
    ])
    await transport.disconnect()

    expect(transport.state).toBe('disconnected')
    expect(port.reader.cancelCalls).toBe(1)
    expect(port.reader.releaseCalls).toBe(1)
    expect(port.writer.releaseCalls).toBe(1)
    expect(port.closeCalls).toBe(1)
  })

  it('can reconnect the selected port after a clean disconnect', async () => {
    const { port, provider, transport } = connectedTransport()

    await transport.select()
    await transport.connect()
    await transport.disconnect()
    await transport.connect()

    expect(provider.requestCalls).toBe(1)
    expect(port.openCalls).toHaveLength(2)
    expect(transport.state).toBe('connected')
  })

  it('rejects connecting before an adapter is selected', async () => {
    const { transport } = connectedTransport()

    await expect(transport.connect()).rejects.toThrow(
      'Select a Web Serial adapter before connecting'
    )
    expect(transport.state).toBe('idle')
  })

  it('rejects selecting another adapter while one is connected', async () => {
    const { transport } = connectedTransport()

    await transport.select()
    await transport.connect()

    await expect(transport.select()).rejects.toThrow(
      'Disconnect the current Web Serial port before selecting another'
    )
    expect(transport.state).toBe('connected')
  })

  it('rejects a second connect while the first is still opening the port', async () => {
    const { port, transport } = connectedTransport()

    await transport.select()
    port.blockOpen = true

    const first = transport.connect()

    await vi.waitFor(() => {
      expect(transport.state).toBe('connecting')
    })

    await expect(transport.connect()).rejects.toThrow(
      'Web Serial transport must be selected before connecting'
    )

    port.pendingOpens[0]?.resolve()
    await expect(first).resolves.toMatchObject({
      kind: 'web-serial-rfcomm'
    })
    expect(port.openCalls).toHaveLength(1)
  })

  it('lets a disconnect requested during an in-flight connect settle to disconnected', async () => {
    const { port, transport } = connectedTransport()

    await transport.select()
    port.blockOpen = true

    const connecting = transport.connect()

    await vi.waitFor(() => {
      expect(transport.state).toBe('connecting')
    })

    const disconnecting = transport.disconnect()

    port.pendingOpens[0]?.resolve()

    await connecting.catch(() => undefined)
    await disconnecting

    expect(transport.state).toBe('disconnected')
  })

  it('feeds fragmented bytes through the unchanged ElmCommandExecutor', async () => {
    const { port, transport } = connectedTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)
    const result = executor.execute('010C')

    await vi.waitFor(() => {
      expect(
        new TextDecoder().decode(port.writer.writes[0])
      ).toBe('010C\r')
    })

    port.reader.reads[0]?.resolve({
      done: false,
      value: new TextEncoder().encode('41 0')
    })
    await Promise.resolve()
    port.reader.reads[1]?.resolve({
      done: false,
      value: new TextEncoder().encode('C 1A F8\r>')
    })

    await expect(result).resolves.toMatchObject({
      command: '010C',
      normalizedText: '41 0C 1A F8'
    })

    executor.dispose()
  })
})
