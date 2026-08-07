import {
  describe,
  expect,
  it
} from 'vitest'

import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { MockObdTransport } from '../../core/obd/transport/MockObdTransport'

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
})
