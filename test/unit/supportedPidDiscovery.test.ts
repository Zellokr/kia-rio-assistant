import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  discoverSupportedPids
} from '../../core/obd/protocol/SupportedPidDiscovery'

import {
  ElmCommandExecutor
} from '../../core/obd/protocol/ElmCommandExecutor'
import type {
  ElmCommandResult
} from '../../core/obd/protocol/ElmCommandExecutor'

import {
  MockObdTransport
} from '../../core/obd/transport/MockObdTransport'

/**
 * Minimal executor stub returning a crafted frame per command, so discovery
 * can be driven with malformed capability responses a marginal link produces.
 */
function stubExecutor(
  frames: Record<string, string>
): ElmCommandExecutor {
  return {
    execute: async (command: string): Promise<ElmCommandResult> => {
      const normalizedText = frames[command] ?? 'NO DATA'

      return {
        command,
        rawText: `${normalizedText}\r>`,
        normalizedText,
        responseKind: 'obd-data',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        latencyMs: 1
      }
    }
  } as unknown as ElmCommandExecutor
}

describe('discoverSupportedPids', () => {
  it('discovers all available PID ranges automatically', async () => {
    const transport = new MockObdTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(
      transport
    )

    const result = await discoverSupportedPids(
      executor
    )

    expect(
      result.ranges.map(range => range.command)
    ).toEqual([
      '0100',
      '0120'
    ])

    expect(result.pids).toEqual(
      expect.arrayContaining([
        '04',
        '05',
        '0C',
        '0D',
        '11'
      ])
    )
    expect(result.pids).toContain('21')

    expect(
      result.ranges[0]?.hasNextRange
    ).toBe(true)

    expect(
      result.ranges[1]?.hasNextRange
    ).toBe(false)

    executor.dispose()

    await transport.disconnect()
  })

  it('uses a 7000ms timeout for the first range and 3000ms for the rest by default', async () => {
    const transport = new MockObdTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(
      transport
    )

    const executeSpy = vi.spyOn(executor, 'execute')

    await discoverSupportedPids(executor)

    expect(executeSpy.mock.calls[0]?.[1]).toBe(7000)
    expect(executeSpy.mock.calls[1]?.[1]).toBe(3000)

    executor.dispose()

    await transport.disconnect()
  })

  it('does not abort when the base range frame is undecodable', async () => {
    // 3 bytes cannot be a supported-PIDs frame; the old code threw and failed
    // the whole connect. Discovery must resolve with a decodeError instead.
    const executor = stubExecutor({ '0100': '41 00 BE' })

    const result = await discoverSupportedPids(executor)

    expect(result.pids).toEqual([])
    expect(result.ranges).toEqual([])
    expect(result.decodeError?.command).toBe('0100')
    expect(result.decodeError?.message).toContain(
      'Incomplete supported PIDs response'
    )
  })

  it('keeps earlier ranges when a later range frame is garbled', async () => {
    const executor = stubExecutor({
      '0100': '41 00 BE 3F A8 13',
      '0120': '41 20 FF'
    })

    const result = await discoverSupportedPids(executor)

    expect(
      result.ranges.map(range => range.command)
    ).toEqual(['0100'])
    expect(result.pids).toEqual(
      expect.arrayContaining(['05', '0C'])
    )
    expect(result.decodeError?.command).toBe('0120')
  })

  it('honors custom initialTimeoutMs and timeoutMs options', async () => {
    const transport = new MockObdTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(
      transport
    )

    const executeSpy = vi.spyOn(executor, 'execute')

    await discoverSupportedPids(executor, {
      initialTimeoutMs: 9000,
      timeoutMs: 4000
    })

    expect(executeSpy.mock.calls[0]?.[1]).toBe(9000)
    expect(executeSpy.mock.calls[1]?.[1]).toBe(4000)

    executor.dispose()

    await transport.disconnect()
  })
})
