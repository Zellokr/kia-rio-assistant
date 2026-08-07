import {
  describe,
  expect,
  it
} from 'vitest'

import {
  initializeElm327
} from '../../core/obd/protocol/Elm327Initializer'

import {
  ElmCommandExecutor
} from '../../core/obd/protocol/ElmCommandExecutor'

import {
  MockObdTransport
} from '../../core/obd/transport/MockObdTransport'

describe('initializeElm327', () => {
  it('initializes the adapter in the expected order', async () => {
    const transport = new MockObdTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(
      transport
    )

    const result = await initializeElm327(
      executor
    )

    expect(result.initialized).toBe(true)

    expect(
      result.commands.map(
        command => command.command
      )
    ).toEqual([
      'ATZ',
      'ATE0',
      'ATL0',
      'ATS0',
      'ATH0',
      'ATSP0'
    ])

    expect(
      result.commands[0]?.normalizedText
    ).toBe('ELM327 v1.5')

    for (const command of result.commands.slice(1)) {
      expect(
        command.normalizedText
      ).toBe('OK')
    }

    executor.dispose()

    await transport.disconnect()
  })
})
