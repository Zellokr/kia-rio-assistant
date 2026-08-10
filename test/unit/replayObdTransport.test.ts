import {
  describe,
  expect,
  it
} from 'vitest'

import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import {
  buildReplayTranscript,
  ReplayObdTransport
} from '../../core/obd/transport/ReplayObdTransport'
import {
  createSession,
  responseEvents,
  timeoutEvents,
  transportWriteErrorEvents
} from '../fixtures/obdReplaySessions'

describe('ReplayObdTransport', () => {
  it('builds ordered transactions from a complete schema v1 export', () => {
    const transcript = buildReplayTranscript(
      createSession([
        ...responseEvents(
          'command-1',
          '010C',
          ['41 0', 'C 1A', ' F8\r>'],
          '41 0C 1A F8'
        ),
        ...responseEvents(
          'command-2',
          '03',
          ['43 03 00 04 20 00 00\r>'],
          '43 03 00 04 20 00 00'
        )
      ])
    )

    expect(transcript.transactions).toHaveLength(2)
    expect(transcript.transactions[0]).toMatchObject({
      command: '010C',
      chunks: [
        { rawText: '41 0', delayMs: 10 },
        { rawText: 'C 1A', delayMs: 10 },
        { rawText: ' F8\r>', delayMs: 10 }
      ],
      outcome: 'response'
    })
    expect(transcript.transactions[1]).toMatchObject({
      command: '03',
      outcome: 'response'
    })
  })

  it('rejects unsupported, incomplete and malformed exports at the boundary', () => {
    expect(() => buildReplayTranscript({
      schemaVersion: 2
    })).toThrow('schemaVersion must be 1')

    const incomplete = createSession([])
    incomplete.retention.complete = false
    incomplete.retention.droppedEvents = 1

    expect(() => buildReplayTranscript(incomplete)).toThrow(
      'recording is incomplete'
    )

    expect(() => buildReplayTranscript(
      createSession([{
        type: 'tx',
        commandId: 'command-1'
      }])
    )).toThrow('events[0].command must be a non-empty string')
  })

  it('replays recorded response fragmentation through subscribers', async () => {
    const transport = new ReplayObdTransport(
      createSession(responseEvents(
        'command-1',
        '010C',
        ['41 0', 'C 1A', ' F8\r>'],
        '41 0C 1A F8'
      )),
      { timingScale: 0 }
    )
    const chunks: string[] = []

    transport.subscribe((chunk) => {
      chunks.push(new TextDecoder().decode(chunk))
    })

    await transport.select()
    await transport.connect()
    await transport.write(
      new TextEncoder().encode('010C\r')
    )

    expect(chunks).toEqual([
      '41 0',
      'C 1A',
      ' F8\r>'
    ])
  })

  it('does not consume a transaction when the command mismatches', async () => {
    const transport = new ReplayObdTransport(
      createSession(responseEvents(
        'command-1',
        '0105',
        ['41 05 5A\r>'],
        '41 05 5A'
      )),
      { timingScale: 0 }
    )

    await transport.select()
    await transport.connect()

    await expect(transport.write(
      new TextEncoder().encode('010C\r')
    )).rejects.toThrow(
      'expected 0105 but received 010C'
    )

    await expect(transport.write(
      new TextEncoder().encode('0105\r')
    )).resolves.toBeUndefined()
  })

  it('reproduces responses and recorded timeouts through ElmCommandExecutor', async () => {
    const transport = new ReplayObdTransport(
      createSession([
        ...responseEvents(
          'command-1',
          '010C',
          ['41 0', 'C 1A', ' F8\r>'],
          '41 0C 1A F8'
        ),
        ...responseEvents(
          'command-2',
          '0199',
          ['NO DATA\r>'],
          'NO DATA'
        ),
        ...timeoutEvents('command-3', '0198'),
        ...responseEvents(
          'command-4',
          '03',
          ['43 03 00 04 20 00 00\r>'],
          '43 03 00 04 20 00 00'
        )
      ]),
      { timingScale: 0 }
    )

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).resolves.toMatchObject({
      normalizedText: '41 0C 1A F8'
    })
    await expect(executor.execute('0199')).rejects.toThrow(
      'ELM327 no-data: NO DATA'
    )
    await expect(executor.execute('0198', 5)).rejects.toThrow(
      'Timeout waiting for ELM327 response to 0198'
    )
    await expect(executor.execute('03')).resolves.toMatchObject({
      normalizedText: '43 03 00 04 20 00 00'
    })

    executor.dispose()
  })

  it('reports exhaustion and resets the cursor after a new selection', async () => {
    const session = createSession(responseEvents(
      'command-1',
      '010D',
      ['41 0D 20\r>'],
      '41 0D 20'
    ))
    const transport = new ReplayObdTransport(
      session,
      { timingScale: 0 }
    )
    const command = new TextEncoder().encode('010D\r')

    await transport.select()
    await transport.connect()
    await transport.write(command)

    await expect(transport.write(command)).rejects.toThrow(
      'Replay transcript exhausted'
    )

    await transport.disconnect()
    await transport.select()
    await transport.connect()

    await expect(transport.write(command)).resolves.toBeUndefined()
  })

  it('rethrows recorded transport-write errors through the executor', async () => {
    const transport = new ReplayObdTransport(
      createSession(transportWriteErrorEvents(
        'command-1',
        '010C',
        'Recorded adapter disconnected'
      )),
      { timingScale: 0 }
    )

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).rejects.toThrow(
      'Recorded adapter disconnected'
    )

    executor.dispose()
  })
})
