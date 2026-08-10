import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { decodeMode03Response } from '../../core/obd/decoder/decodeMode03Response'
import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import {
  buildReplayTranscript,
  ReplayObdTransport
} from '../../core/obd/transport/ReplayObdTransport'
import {
  buildBusInitErrorSession,
  buildDtcP0300Session,
  buildDtcP0420Session,
  buildFragmentedResponseSession,
  buildMidResponseDisconnectSession,
  buildNoDataSession,
  buildNormalResponseSession,
  buildStoppedSession,
  buildTimeoutSession,
  buildTransportErrorSession,
  buildUnableToConnectSession,
  buildUnknownCommandSession
} from '../fixtures/obdReplaySessions'

async function connectedReplay(
  session: unknown,
  options: { timingScale?: number } = { timingScale: 0 }
) {
  const transport = new ReplayObdTransport(session, options)

  await transport.select()
  await transport.connect()

  return transport
}

describe('obdReplaySessions fixtures', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('buildNormalResponseSession feeds a successful RPM response', async () => {
    const session = buildNormalResponseSession()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions).toHaveLength(1)
    expect(transcript.transactions[0]).toMatchObject({
      command: '010C',
      outcome: 'response',
      chunks: [{ rawText: '41 0C 1A F8\r>' }]
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).resolves.toMatchObject({
      normalizedText: '41 0C 1A F8'
    })

    executor.dispose()
  })

  it('buildNoDataSession rejects with ELM327 no-data', async () => {
    const session = buildNoDataSession()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]).toMatchObject({
      command: '0199',
      outcome: 'response',
      chunks: [{ rawText: 'NO DATA\r>' }]
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0199')).rejects.toThrow(
      'ELM327 no-data: NO DATA'
    )

    executor.dispose()
  })

  it('buildTimeoutSession reproduces a recorded timeout', async () => {
    const session = buildTimeoutSession()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]).toMatchObject({
      command: '0198',
      outcome: 'timeout',
      chunks: []
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0198', 5)).rejects.toThrow(
      'Timeout waiting for ELM327 response to 0198'
    )

    executor.dispose()
  })

  it('buildTransportErrorSession rejects with the recorded write error', async () => {
    const session = buildTransportErrorSession()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]).toMatchObject({
      command: '010C',
      outcome: 'transport-error',
      errorMessage: 'Recorded adapter disconnected'
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).rejects.toThrow(
      'Recorded adapter disconnected'
    )

    executor.dispose()
  })

  it('buildUnableToConnectSession rejects with unable-to-connect', async () => {
    const session = buildUnableToConnectSession()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]).toMatchObject({
      command: '010C',
      outcome: 'response'
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).rejects.toThrow(
      'ELM327 unable-to-connect: UNABLE TO CONNECT'
    )

    executor.dispose()
  })

  it('buildBusInitErrorSession rejects with bus-init-error', async () => {
    const session = buildBusInitErrorSession()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]).toMatchObject({
      command: '010C',
      outcome: 'response'
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).rejects.toThrow(
      'ELM327 bus-init-error: BUS INIT: ERROR'
    )

    executor.dispose()
  })

  it('buildStoppedSession rejects with stopped', async () => {
    const session = buildStoppedSession()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]).toMatchObject({
      command: '010C',
      outcome: 'response'
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).rejects.toThrow(
      'ELM327 stopped: STOPPED'
    )

    executor.dispose()
  })

  it('buildUnknownCommandSession rejects with unknown-command', async () => {
    const session = buildUnknownCommandSession()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]).toMatchObject({
      command: '010C',
      outcome: 'response'
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).rejects.toThrow(
      'ELM327 unknown-command: ?'
    )

    executor.dispose()
  })

  it('buildFragmentedResponseSession replays three chunks into one frame', async () => {
    const session = buildFragmentedResponseSession()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]).toMatchObject({
      command: '010C',
      outcome: 'response',
      chunks: [
        { rawText: '41 0', delayMs: 10 },
        { rawText: 'C 1A', delayMs: 10 },
        { rawText: ' F8\r>', delayMs: 10 }
      ]
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('010C')).resolves.toMatchObject({
      normalizedText: '41 0C 1A F8'
    })

    executor.dispose()
  })

  it('buildDtcP0300Session decodes to P0300', async () => {
    const session = buildDtcP0300Session()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]).toMatchObject({
      command: '03',
      outcome: 'response'
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)
    const result = await executor.execute('03')

    expect(result.normalizedText).toBe('43 03 00 00 00')
    expect(decodeMode03Response(result.normalizedText).dtcs).toEqual([
      'P0300'
    ])

    executor.dispose()
  })

  it('buildDtcP0420Session decodes to P0420', async () => {
    const session = buildDtcP0420Session()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]).toMatchObject({
      command: '03',
      outcome: 'response'
    })

    const transport = await connectedReplay(session)
    const executor = new ElmCommandExecutor(transport)
    const result = await executor.execute('03')

    expect(result.normalizedText).toBe('43 04 20 00 00')
    expect(decodeMode03Response(result.normalizedText).dtcs).toEqual([
      'P0420'
    ])

    executor.dispose()
  })

  it('buildMidResponseDisconnectSession stops emitting after a mid-write disconnect', async () => {
    vi.useFakeTimers()

    const session = buildMidResponseDisconnectSession()
    const transcript = buildReplayTranscript(session)

    expect(transcript.transactions[0]?.chunks.length).toBeGreaterThanOrEqual(2)
    expect(
      transcript.transactions[0]?.chunks.every(chunk => chunk.delayMs > 0)
    ).toBe(true)

    const transport = await connectedReplay(session, { timingScale: 1 })
    const chunks: string[] = []

    transport.subscribe((chunk) => {
      chunks.push(new TextDecoder().decode(chunk))
    })

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
})
