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
  createSession,
  responseEvents
} from '../fixtures/obdReplaySessions'

/**
 * Splits a full ELM frame (including the terminating prompt) into one recorded
 * rx-chunk per byte, the worst-case delivery a marginal BLE link can produce.
 */
function byteAtATimeChunks(frame: string): string[] {
  return [...frame]
}

afterEach(() => {
  vi.useRealTimers()
})

describe('worst-case fragmentation over the replay pipeline', () => {
  it('reconstructs a response delivered one byte per chunk', async () => {
    const frame = '41 0C 1A F8\r>'
    const transport = new ReplayObdTransport(
      createSession(responseEvents(
        'command-1',
        '010C',
        byteAtATimeChunks(frame),
        '41 0C 1A F8'
      )),
      { timingScale: 0 }
    )

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).resolves.toMatchObject({
      command: '010C',
      normalizedText: '41 0C 1A F8',
      responseKind: 'obd-data'
    })

    executor.dispose()
  })

  it('strips a NUL byte interleaved as its own chunk mid-frame', async () => {
    const transport = new ReplayObdTransport(
      createSession(responseEvents(
        'command-1',
        '0105',
        ['41 05', '\x00', ' 5A\r>'],
        '41 05 5A'
      )),
      { timingScale: 0 }
    )

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0105')).resolves.toMatchObject({
      normalizedText: '41 05 5A'
    })

    executor.dispose()
  })

  it('accumulates per-chunk latency across a slow byte-at-a-time drip', async () => {
    vi.useFakeTimers()

    const frame = '41 0C 1A F8\r>'
    const transport = new ReplayObdTransport(
      createSession(responseEvents(
        'command-1',
        '010C',
        byteAtATimeChunks(frame),
        '41 0C 1A F8'
      )),
      { timingScale: 1 }
    )

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)
    const pending = executor.execute('010C', 5_000)

    // Recorded chunks are 10ms apart; the frame closes only on the prompt.
    await vi.advanceTimersByTimeAsync(frame.length * 10)

    const result = await pending

    expect(result.normalizedText).toBe('41 0C 1A F8')
    expect(result.latencyMs).toBeGreaterThan(0)

    executor.dispose()
  })

  it('does not leak trailing bytes into the next command after a mid-frame drop', async () => {
    vi.useFakeTimers()

    const transport = new ReplayObdTransport(
      createSession([
        ...responseEvents(
          'command-1',
          '010C',
          byteAtATimeChunks('41 0C 1A F8\r>'),
          '41 0C 1A F8'
        ),
        ...responseEvents(
          'command-2',
          '0105',
          ['41 05 5A\r>'],
          '41 05 5A'
        )
      ]),
      { timingScale: 1 }
    )

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)
    const interrupted = executor.execute('010C', 5_000)

    // Let a few bytes arrive, then drop the link mid-frame.
    await vi.advanceTimersByTimeAsync(30)
    await transport.disconnect()

    await expect(interrupted).rejects.toThrow(
      'OBD transport is not connected'
    )

    // A fresh session must reconstruct the next command cleanly, proving no
    // stale bytes from the dropped frame remain buffered.
    await transport.select()
    await transport.connect()

    const recovered = executor.execute('010C', 5_000)

    await vi.advanceTimersByTimeAsync('41 0C 1A F8\r>'.length * 10)

    await expect(recovered).resolves.toMatchObject({
      normalizedText: '41 0C 1A F8'
    })

    executor.dispose()
  })
})
