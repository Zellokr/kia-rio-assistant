import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { initializeElm327 } from '../../core/obd/protocol/Elm327Initializer'
import { discoverSupportedPids } from '../../core/obd/protocol/SupportedPidDiscovery'
import { ObdPollScheduler } from '../../core/obd/polling/ObdPollScheduler'
import { MockObdTransport } from '../../core/obd/transport/MockObdTransport'
import {
  ReplayObdTransport
} from '../../core/obd/transport/ReplayObdTransport'
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

  read(): Promise<ReadableStreamReadResult<Uint8Array>> {
    const deferred
      = new Deferred<ReadableStreamReadResult<Uint8Array>>()

    this.reads.push(deferred)
    return deferred.promise
  }

  async cancel(): Promise<void> {
    this.reads.at(-1)?.resolve({ done: true, value: undefined })
  }

  releaseLock(): void {}
}

class FakeWriter implements WebSerialWriter {
  readonly writes: Uint8Array[] = []

  async write(data: Uint8Array): Promise<void> {
    this.writes.push(data.slice())
  }

  releaseLock(): void {}
}

class FakePort implements WebSerialPort {
  readonly reader = new FakeReader()
  readonly writer = new FakeWriter()

  readonly readable = {
    getReader: (): WebSerialReader => this.reader
  }

  readonly writable = {
    getWriter: (): WebSerialWriter => this.writer
  }

  async open(): Promise<void> {}
  async close(): Promise<void> {}

  getInfo(): WebSerialPortInfo {
    return {}
  }
}

async function connectedPhysicalTransport() {
  const port = new FakePort()
  const provider: WebSerialProvider = {
    async requestPort() {
      return port
    }
  }
  const transport = new WebSerialRfcommTransport({
    provider,
    isSecureContext: () => true
  })

  await transport.select()
  await transport.connect()

  return { port, transport }
}

/** Resolves the pending read for a queued response so the executor can decode it. */
function respond(port: FakePort, index: number, rawText: string): void {
  port.reader.reads[index]?.resolve({
    done: false,
    value: new TextEncoder().encode(rawText)
  })
}

describe('physical read-only command policy — integration', () => {
  it('allows a whitelisted manual command and writes it to the real port', async () => {
    const { port, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    const result = executor.execute('0100')

    await waitForWrite(port, 1)
    respond(port, 0, '41 00 00 00 00 00\r>')

    await expect(result).resolves.toMatchObject({ command: '0100' })
    expect(port.writer.writes).toHaveLength(1)

    executor.dispose()
  })

  it('rejects a manual command outside the physical allowlist without touching the real port', async () => {
    const { port, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0104')).rejects.toThrow(
      /not (allowed|in the allowed)/i
    )

    expect(port.writer.writes).toHaveLength(0)

    executor.dispose()
  })

  it('always rejects Mode 04 on the physical transport', async () => {
    const { port, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('04')).rejects.toThrow()
    expect(port.writer.writes).toHaveLength(0)

    executor.dispose()
  })

  it('runs the full ELM327 initialization sequence over the physical transport', async () => {
    const { port, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    const initPromise = initializeElm327(executor)

    const scripted = [
      'ELM327 v1.5\r>',
      'OK\r>',
      'OK\r>',
      'OK\r>',
      'OK\r>',
      'OK\r>'
    ]

    for (let index = 0; index < scripted.length; index++) {
      await waitForWrite(port, index + 1)
      respond(port, index, scripted[index]!)
    }

    const result = await initPromise

    expect(result.initialized).toBe(true)
    expect(port.writer.writes.map(bytes =>
      new TextDecoder().decode(bytes).trim()
    )).toEqual([
      'ATZ',
      'ATE0',
      'ATL0',
      'ATS0',
      'ATH0',
      'ATSP0'
    ])

    executor.dispose()
  })

  it('runs supported PID discovery starting from 0100 over the physical transport', async () => {
    const { port, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    const discoveryPromise = discoverSupportedPids(executor)

    await waitForWrite(port, 1)
    respond(port, 0, '41 00 00 00 00 00\r>')

    const discovery = await discoveryPromise

    expect(discovery.ranges).toHaveLength(1)
    expect(discovery.ranges[0]?.command).toBe('0100')
    expect(port.writer.writes).toHaveLength(1)

    executor.dispose()
  })

  it('walks into the extended range when the vehicle advertises one', async () => {
    const { port, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    const discoveryPromise = discoverSupportedPids(executor)

    await waitForWrite(port, 1)
    // PID 20 supported (last data bit set) signals hasNextRange, so discovery
    // continues into 0120. This mirrors the real 2026-08-24 vehicle capture,
    // whose 0100 bitmask 4100BE3EB813 also set PID 20.
    respond(port, 0, '41 00 00 00 00 01\r>')

    await waitForWrite(port, 2)
    // 0120 answers with no further range, ending the walk.
    respond(port, 1, '41 20 00 00 00 00\r>')

    const discovery = await discoveryPromise

    expect(discovery.ranges).toHaveLength(2)
    expect(discovery.ranges[0]?.command).toBe('0100')
    expect(discovery.ranges[0]?.hasNextRange).toBe(true)
    expect(discovery.ranges[1]?.command).toBe('0120')
    expect(port.writer.writes).toHaveLength(2)

    executor.dispose()
  })

  it('never sends unauthorized telemetry PIDs during physical polling', async () => {
    const { port, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)
    const scheduler = new ObdPollScheduler(executor)

    const errors: Error[] = []

    scheduler.onError((event) => {
      errors.push(event.error)
    })

    scheduler.addTask({
      id: 'engine-load',
      command: '0104',
      intervalMs: 50
    })
    scheduler.addTask({
      id: 'vehicle-speed',
      command: '010D',
      intervalMs: 50
    })
    scheduler.addTask({
      id: 'throttle-position',
      command: '0111',
      intervalMs: 50
    })

    scheduler.start()

    await vi.waitFor(() => {
      expect(errors.length).toBeGreaterThanOrEqual(3)
    }, { timeout: 5000 })

    scheduler.stop()

    expect(port.writer.writes).toHaveLength(0)
    expect(
      errors.every(error => error.message.length > 0)
    ).toBe(true)

    executor.dispose()
  })

  it('recovers after a rejection: a later whitelisted command still succeeds', async () => {
    const { port, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0104')).rejects.toThrow()
    expect(port.writer.writes).toHaveLength(0)
    expect(transport.state).toBe('connected')

    const result = executor.execute('ATZ')

    await waitForWrite(port, 1)
    respond(port, 0, 'ELM327 v1.5\r>')

    await expect(result).resolves.toMatchObject({ command: 'ATZ' })
    expect(port.writer.writes).toHaveLength(1)

    executor.dispose()
  })

  it('does not restrict MockObdTransport telemetry PIDs used for simulated testing', async () => {
    const transport = new MockObdTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0104')).resolves.toMatchObject({
      command: '0104'
    })
    await expect(executor.execute('010D')).resolves.toMatchObject({
      command: '010D'
    })
    await expect(executor.execute('0111')).resolves.toMatchObject({
      command: '0111'
    })

    executor.dispose()
  })

  it('does not restrict ReplayObdTransport telemetry PIDs used for fixture testing', async () => {
    const sessionExport = {
      schemaVersion: 1,
      sessionId: 'replay-1',
      retention: { complete: true },
      transport: { kind: 'mock', name: 'Recorded adapter' },
      events: [
        {
          type: 'tx',
          sequence: 1,
          elapsedMs: 0,
          commandId: 'command-1',
          command: '0104'
        },
        {
          type: 'rx-frame',
          sequence: 2,
          elapsedMs: 5,
          commandId: 'command-1',
          rawText: '41 04 50\r>'
        }
      ]
    }

    const transport = new ReplayObdTransport(sessionExport, { timingScale: 0 })

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0104')).resolves.toMatchObject({
      command: '0104'
    })

    executor.dispose()
  })
})

function waitForWrite(
  port: FakePort,
  expectedCount: number
): Promise<void> {
  return vi.waitFor(() => {
    expect(port.writer.writes.length).toBeGreaterThanOrEqual(expectedCount)
  })
}
