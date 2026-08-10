import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { ReplayObdTransport } from '../../core/obd/transport/ReplayObdTransport'
import {
  buildFragmentedResponseSession,
  createSession,
  responseEvents
} from '../fixtures/obdReplaySessions'

function multiTransactionSession() {
  return createSession([
    ...responseEvents(
      'command-1',
      '010C',
      ['41 0C 1A F8\r>'],
      '41 0C 1A F8'
    ),
    ...responseEvents(
      'command-2',
      '0105',
      ['41 05 5A\r>'],
      '41 05 5A'
    ),
    ...responseEvents(
      'command-3',
      '010D',
      ['41 0D 20\r>'],
      '41 0D 20'
    )
  ])
}

function fragmentedThenFollowUpSession() {
  return createSession([
    ...responseEvents(
      'command-1',
      '010C',
      ['41 0', 'C 1A', ' F8\r>'],
      '41 0C 1A F8'
    ),
    ...responseEvents(
      'command-2',
      '0105',
      ['41 05 5A\r>'],
      '41 05 5A'
    )
  ])
}

describe('ReplayObdTransport reconnect lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops emitting remaining fragments after a mid-response disconnect', async () => {
    vi.useFakeTimers()

    const transport = new ReplayObdTransport(
      buildFragmentedResponseSession(),
      { timingScale: 1 }
    )
    const chunks: string[] = []

    transport.subscribe((chunk) => {
      chunks.push(new TextDecoder().decode(chunk))
    })

    await transport.select()
    await transport.connect()

    const writePromise = transport.write(
      new TextEncoder().encode('010C\r')
    )

    await vi.advanceTimersByTimeAsync(10)
    expect(chunks).toEqual(['41 0'])

    await transport.disconnect()
    await vi.advanceTimersByTimeAsync(100)
    await writePromise

    expect(chunks).toEqual(['41 0'])
  })

  it('treats a mid-response interrupted transaction as consumed until select resets the cursor', async () => {
    vi.useFakeTimers()

    const transport = new ReplayObdTransport(
      fragmentedThenFollowUpSession(),
      { timingScale: 1 }
    )
    const chunks: string[] = []

    transport.subscribe((chunk) => {
      chunks.push(new TextDecoder().decode(chunk))
    })

    await transport.select()
    await transport.connect()

    const interrupted = transport.write(
      new TextEncoder().encode('010C\r')
    )
    await vi.advanceTimersByTimeAsync(10)
    expect(chunks).toEqual(['41 0'])

    await transport.disconnect()
    await vi.advanceTimersByTimeAsync(100)
    await interrupted

    // cursor++ runs before chunk delivery, so reconnect without select
    // continues at the next recorded transaction.
    await transport.connect()
    chunks.length = 0
    const followUp = transport.write(
      new TextEncoder().encode('0105\r')
    )
    await vi.advanceTimersByTimeAsync(10)
    await followUp
    expect(chunks).toEqual(['41 05 5A\r>'])

    await transport.disconnect()
    await transport.select()
    await transport.connect()

    chunks.length = 0
    const replayFromStart = transport.write(
      new TextEncoder().encode('010C\r')
    )
    await vi.advanceTimersByTimeAsync(30)
    await replayFromStart
    expect(chunks).toEqual(['41 0', 'C 1A', ' F8\r>'])
  })

  it('preserves the cursor across disconnect→connect and resets it on select', async () => {
    const transport = new ReplayObdTransport(
      multiTransactionSession(),
      { timingScale: 0 }
    )

    await transport.select()
    await transport.connect()
    await transport.write(new TextEncoder().encode('010C\r'))

    await transport.disconnect()
    await transport.connect()
    await transport.write(new TextEncoder().encode('0105\r'))

    await transport.disconnect()
    await transport.connect()
    await transport.write(new TextEncoder().encode('010D\r'))

    await expect(
      transport.write(new TextEncoder().encode('010C\r'))
    ).rejects.toThrow('Replay transcript exhausted')

    await transport.disconnect()
    await transport.select()
    await transport.connect()
    await expect(
      transport.write(new TextEncoder().encode('010C\r'))
    ).resolves.toBeUndefined()
  })

  it('supports multiple disconnect→select→connect cycles against a multi-transaction transcript', async () => {
    const transport = new ReplayObdTransport(
      multiTransactionSession(),
      { timingScale: 0 }
    )
    const chunks: string[] = []

    transport.subscribe((chunk) => {
      chunks.push(new TextDecoder().decode(chunk))
    })

    for (let cycle = 0; cycle < 3; cycle++) {
      await transport.select()
      await transport.connect()

      chunks.length = 0
      await transport.write(new TextEncoder().encode('010C\r'))
      expect(chunks).toEqual(['41 0C 1A F8\r>'])

      chunks.length = 0
      await transport.write(new TextEncoder().encode('0105\r'))
      expect(chunks).toEqual(['41 05 5A\r>'])

      await transport.disconnect()
    }
  })

  it('keeps one ElmCommandExecutor subscribed across transport reconnect', async () => {
    const transport = new ReplayObdTransport(
      multiTransactionSession(),
      { timingScale: 0 }
    )

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).resolves.toMatchObject({
      normalizedText: '41 0C 1A F8'
    })

    await transport.disconnect()
    await transport.connect()

    await expect(executor.execute('0105')).resolves.toMatchObject({
      normalizedText: '41 05 5A'
    })

    await transport.disconnect()
    await transport.select()
    await transport.connect()

    await expect(executor.execute('010C')).resolves.toMatchObject({
      normalizedText: '41 0C 1A F8'
    })

    executor.dispose()
  })

  it('rejects an in-flight executor command immediately when the transport disconnects mid-response', async () => {
    vi.useFakeTimers()

    const transport = new ReplayObdTransport(
      buildFragmentedResponseSession(),
      { timingScale: 1 }
    )

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)
    const inFlight = executor.execute('010C', 5_000)

    await vi.advanceTimersByTimeAsync(10)

    await transport.disconnect()

    await expect(inFlight).rejects.toThrow(
      'OBD transport is not connected'
    )

    executor.dispose()
  })
})
