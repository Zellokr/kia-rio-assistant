import {
  describe,
  expect,
  it
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

    expect(result.pids).toContain('05')
    expect(result.pids).toContain('0C')
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
})
