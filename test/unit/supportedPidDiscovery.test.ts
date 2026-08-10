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

import {
  MockObdTransport
} from '../../core/obd/transport/MockObdTransport'

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
