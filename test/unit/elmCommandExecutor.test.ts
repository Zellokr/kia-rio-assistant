import {
  describe,
  expect,
  it
} from 'vitest'

import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { MockObdTransport } from '../../core/obd/transport/MockObdTransport'
import type {
  ObdSessionEventInput
} from '../../core/obd/logging/ObdSessionLog'
import type {
  ObdTransport,
  ObdTransportMetadata,
  ObdTransportState
} from '../../core/obd/transport/ObdTransport'

class ScriptedTransport implements ObdTransport {
  readonly kind = 'mock' as const
  state: ObdTransportState = 'connected'
  private readonly listeners = new Set<
    (data: Uint8Array) => void
  >()

  private readonly stateListeners = new Set<
    (state: ObdTransportState) => void
  >()

  constructor(
    private readonly responses: Record<
      string,
      string[] | undefined
    >
  ) {}

  async select(): Promise<ObdTransportMetadata> {
    return { kind: this.kind }
  }

  async connect(): Promise<ObdTransportMetadata> {
    return { kind: this.kind }
  }

  async disconnect(): Promise<void> {
    this.setState('disconnected')
  }

  async write(data: Uint8Array): Promise<void> {
    const command = new TextDecoder()
      .decode(data)
      .trim()
      .toUpperCase()

    for (const chunk of this.responses[command] ?? []) {
      const bytes = new TextEncoder().encode(chunk)

      for (const listener of this.listeners) {
        listener(bytes)
      }
    }
  }

  subscribe(
    listener: (data: Uint8Array) => void
  ): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeState(
    listener: (state: ObdTransportState) => void
  ): () => void {
    this.stateListeners.add(listener)

    return () => {
      this.stateListeners.delete(listener)
    }
  }

  private setState(next: ObdTransportState): void {
    if (this.state === next) {
      return
    }

    this.state = next

    for (const listener of this.stateListeners) {
      listener(next)
    }
  }
}

describe('ElmCommandExecutor', () => {
  it('executes commands sequentially', async () => {
    const transport = new MockObdTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(
      transport
    )

    const results = await Promise.all([
      executor.execute('010C'),
      executor.execute('0105'),
      executor.execute('03')
    ])

    expect(
      results[0]?.normalizedText
    ).toBe('41 0C 1A F8')

    expect(
      results[1]?.normalizedText
    ).toBe('41 05 5A')

    expect(
      results[2]?.normalizedText
    ).toBe(
      '43 00 00 00 00 00 00'
    )

    executor.dispose()

    await transport.disconnect()
  })

  it('recovers after a command timeout', async () => {
    const transport = new MockObdTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(
      transport
    )

    await expect(
      executor.execute('0198', 300)
    ).rejects.toThrow(
      'Timeout waiting for ELM327 response to 0198'
    )

    const result = await executor.execute(
      '010C'
    )

    expect(
      result.normalizedText
    ).toBe('41 0C 1A F8')

    expect(
      result.responseKind
    ).toBe('obd-data')

    executor.dispose()

    await transport.disconnect()
  })

  it('executes every mocked telemetry command', async () => {
    const transport = new MockObdTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(
      transport
    )

    const results = await Promise.all([
      executor.execute(' 0104 '),
      executor.execute('0105'),
      executor.execute('010C'),
      executor.execute('010D'),
      executor.execute('0111')
    ])

    expect(
      results.map(result => result.normalizedText)
    ).toEqual([
      '41 04 50',
      '41 05 5A',
      '41 0C 1A F8',
      '41 0D 00',
      '41 11 20'
    ])

    executor.dispose()
    await transport.disconnect()
  })

  it('recovers after a NO DATA response', async () => {
    const transport = new MockObdTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(
      transport
    )

    await expect(
      executor.execute('0199')
    ).rejects.toThrow(
      'ELM327 no-data: NO DATA'
    )

    const result = await executor.execute('010D')

    expect(result.normalizedText).toBe('41 0D 00')
    expect(result.responseKind).toBe('obd-data')

    executor.dispose()
    await transport.disconnect()
  })

  it('observes correlated TX, RX chunks and the completed frame', async () => {
    const events: ObdSessionEventInput[] = []
    const transport = new ScriptedTransport({
      '010C': ['41 0', 'C 1A', ' F8\r>']
    })
    const executor = new ElmCommandExecutor(
      transport,
      event => events.push(event)
    )

    await executor.execute(' 010c ')

    expect(events.map(event => event.type)).toEqual([
      'command-queued',
      'tx',
      'rx-chunk',
      'rx-chunk',
      'rx-chunk',
      'rx-frame'
    ])

    expect(events).toEqual([
      expect.objectContaining({
        type: 'command-queued',
        commandId: 'command-1',
        command: '010C'
      }),
      expect.objectContaining({
        type: 'tx',
        direction: 'tx',
        commandId: 'command-1',
        command: '010C',
        rawText: '010C\r',
        normalizedText: '010C'
      }),
      expect.objectContaining({
        type: 'rx-chunk',
        commandId: 'command-1',
        rawText: '41 0'
      }),
      expect.objectContaining({
        type: 'rx-chunk',
        commandId: 'command-1',
        rawText: 'C 1A'
      }),
      expect.objectContaining({
        type: 'rx-chunk',
        commandId: 'command-1',
        rawText: ' F8\r>'
      }),
      expect.objectContaining({
        type: 'rx-frame',
        direction: 'rx',
        commandId: 'command-1',
        command: '010C',
        rawText: '41 0C 1A F8\r>',
        normalizedText: '41 0C 1A F8',
        responseKind: 'obd-data',
        latencyMs: expect.any(Number)
      })
    ])

    executor.dispose()
  })

  it('observes NO DATA as a frame and error before recovering', async () => {
    const events: ObdSessionEventInput[] = []
    const transport = new ScriptedTransport({
      '0199': ['NO DATA\r>'],
      '010D': ['41 0D 00\r>']
    })
    const executor = new ElmCommandExecutor(
      transport,
      event => events.push(event)
    )

    await expect(
      executor.execute('0199')
    ).rejects.toThrow('ELM327 no-data: NO DATA')

    await expect(
      executor.execute('010D')
    ).resolves.toMatchObject({
      normalizedText: '41 0D 00'
    })

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'rx-frame',
        commandId: 'command-1',
        responseKind: 'no-data',
        normalizedText: 'NO DATA'
      })
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        commandId: 'command-1',
        responseKind: 'no-data',
        normalizedText: 'NO DATA',
        error: {
          name: 'Error',
          message: 'ELM327 no-data: NO DATA',
          phase: 'response'
        }
      })
    )

    executor.dispose()
  })

  it('observes timeout recovery and ignores observer failures', async () => {
    const events: ObdSessionEventInput[] = []
    const transport = new ScriptedTransport({
      '0198': undefined,
      '010D': ['41 0D 00\r>']
    })
    const executor = new ElmCommandExecutor(
      transport,
      (event) => {
        events.push(event)

        if (event.type === 'tx') {
          throw new Error('Broken log observer')
        }
      }
    )

    await expect(
      executor.execute('0198', 5)
    ).rejects.toThrow(
      'Timeout waiting for ELM327 response to 0198'
    )

    await expect(
      executor.execute('010D')
    ).resolves.toMatchObject({
      normalizedText: '41 0D 00'
    })

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        commandId: 'command-1',
        command: '0198',
        latencyMs: expect.any(Number),
        error: {
          name: 'Error',
          message: 'Timeout waiting for ELM327 response to 0198',
          phase: 'timeout'
        }
      })
    )

    executor.dispose()
  })

  it('strips a leading command echo from the resolved response (ATZ before ATE0 runs)', async () => {
    const transport = new ScriptedTransport({
      ATZ: ['ATZ\r\rELM327 v1.5\r\r>']
    })
    const executor = new ElmCommandExecutor(transport)
    const result = await executor.execute('ATZ', 5000)
    expect(result.normalizedText).toBe('ELM327 v1.5')
    executor.dispose()
  })

  it('strips SEARCHING... from the resolved normalizedText, not just from classification', async () => {
    const transport = new ScriptedTransport({
      '0100': ['0100\r\rSEARCHING...\r41 00 BE 3F A8 13\r\r>']
    })
    const executor = new ElmCommandExecutor(transport)
    const result = await executor.execute('0100')
    expect(result.normalizedText).toBe('41 00 BE 3F A8 13')
    expect(result.responseKind).toBe('obd-data')
    executor.dispose()
  })

  it('rejects the in-flight command and queued work immediately on transport disconnect', async () => {
    const events: ObdSessionEventInput[] = []
    const transport = new ScriptedTransport({
      // No terminating prompt — keeps the first command in flight.
      '010C': ['41 0'],
      '0105': ['41 05 5A\r>']
    })
    const executor = new ElmCommandExecutor(
      transport,
      (event) => {
        events.push(event)
      }
    )

    const inFlight = executor.execute('010C', 5000)
    const queued = executor.execute('0105', 5000)

    await transport.disconnect()

    await expect(inFlight).rejects.toThrow(
      'OBD transport is not connected'
    )
    await expect(queued).rejects.toThrow(
      'OBD transport is not connected'
    )

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        command: '010C',
        error: {
          name: 'Error',
          message: 'OBD transport is not connected',
          phase: 'disconnect'
        }
      })
    )

    executor.dispose()
  })
})
