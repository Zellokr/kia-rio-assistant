import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { MockObdTransport } from '../../core/obd/transport/MockObdTransport'

async function awaitSelect(transport: MockObdTransport) {
  const pending = transport.select()
  await vi.advanceTimersByTimeAsync(200)
  return pending
}

async function awaitConnect(transport: MockObdTransport) {
  const pending = transport.connect()
  await vi.advanceTimersByTimeAsync(300)
  return pending
}

async function awaitDisconnect(transport: MockObdTransport) {
  const pending = transport.disconnect()
  await vi.advanceTimersByTimeAsync(150)
  return pending
}

async function selectAndConnect(transport: MockObdTransport) {
  await awaitSelect(transport)
  await awaitConnect(transport)
}

describe('MockObdTransport', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('exposes intermediate states during select, connect and disconnect', async () => {
    vi.useFakeTimers()

    const transport = new MockObdTransport()

    expect(transport.state).toBe('idle')

    const selectPromise = transport.select()
    expect(transport.state).toBe('selecting')
    await vi.advanceTimersByTimeAsync(200)
    await selectPromise
    expect(transport.state).toBe('selected')

    const connectPromise = transport.connect()
    expect(transport.state).toBe('connecting')
    await vi.advanceTimersByTimeAsync(300)
    await connectPromise
    expect(transport.state).toBe('connected')

    const disconnectPromise = transport.disconnect()
    expect(transport.state).toBe('disconnecting')
    await vi.advanceTimersByTimeAsync(150)
    await disconnectPromise
    expect(transport.state).toBe('disconnected')
  })

  it('rejects write before connect and after disconnect', async () => {
    vi.useFakeTimers()

    const transport = new MockObdTransport()
    const payload = new TextEncoder().encode('010C\r')

    await expect(transport.write(payload)).rejects.toThrow(
      'OBD transport is not connected'
    )

    await awaitSelect(transport)

    await expect(transport.write(payload)).rejects.toThrow(
      'OBD transport is not connected'
    )

    await awaitConnect(transport)
    await awaitDisconnect(transport)

    await expect(transport.write(payload)).rejects.toThrow(
      'OBD transport is not connected'
    )
  })

  it('replays a fragmented 010C response after a full reconnect cycle', async () => {
    vi.useFakeTimers()

    const transport = new MockObdTransport()
    const chunks: string[] = []

    transport.subscribe((chunk) => {
      chunks.push(new TextDecoder().decode(chunk))
    })

    await selectAndConnect(transport)

    const firstWrite = transport.write(
      new TextEncoder().encode('010C\r')
    )
    await vi.advanceTimersByTimeAsync(150 + 60 * 3)
    await firstWrite

    expect(chunks).toEqual(['41 0', 'C 1A', ' F8\r>'])

    await awaitDisconnect(transport)
    chunks.length = 0

    await selectAndConnect(transport)

    const secondWrite = transport.write(
      new TextEncoder().encode('010C\r')
    )
    await vi.advanceTimersByTimeAsync(150 + 60 * 3)
    await secondWrite

    expect(chunks).toEqual(['41 0', 'C 1A', ' F8\r>'])
  })

  it('does not leak delayed 010C fragments after disconnect mid-response', async () => {
    vi.useFakeTimers()

    const transport = new MockObdTransport()
    const chunks: string[] = []

    transport.subscribe((chunk) => {
      chunks.push(new TextDecoder().decode(chunk))
    })

    await selectAndConnect(transport)

    const writePromise = transport.write(
      new TextEncoder().encode('010C\r')
    )

    // Initial write delay + first fragment delay.
    await vi.advanceTimersByTimeAsync(150 + 60)
    expect(chunks).toEqual(['41 0'])

    const disconnectPromise = transport.disconnect()
    expect(transport.state).toBe('disconnecting')

    await vi.advanceTimersByTimeAsync(1000)
    await writePromise
    await disconnectPromise

    expect(chunks).toEqual(['41 0'])
    expect(transport.state).toBe('disconnected')
  })

  it('does not corrupt a later command with stale fragments from a disconnected write', async () => {
    vi.useFakeTimers()

    const transport = new MockObdTransport()
    const chunks: string[] = []

    transport.subscribe((chunk) => {
      chunks.push(new TextDecoder().decode(chunk))
    })

    await selectAndConnect(transport)

    const staleWrite = transport.write(
      new TextEncoder().encode('010C\r')
    )
    await vi.advanceTimersByTimeAsync(150 + 60)
    expect(chunks).toEqual(['41 0'])

    await awaitDisconnect(transport)
    await staleWrite

    chunks.length = 0
    await selectAndConnect(transport)

    const nextWrite = transport.write(
      new TextEncoder().encode('0105\r')
    )
    await vi.advanceTimersByTimeAsync(150)
    await nextWrite

    // Without a generation guard, leftover 010C fragments would arrive here.
    expect(chunks).toEqual(['41 05 5A\r>'])

    await vi.advanceTimersByTimeAsync(1000)
    expect(chunks).toEqual(['41 05 5A\r>'])
  })

  it('keeps a single ElmCommandExecutor working across reconnect', async () => {
    vi.useFakeTimers()

    const transport = new MockObdTransport()
    await selectAndConnect(transport)

    const executor = new ElmCommandExecutor(transport)
    const first = executor.execute('0105')
    await vi.advanceTimersByTimeAsync(150)
    await expect(first).resolves.toMatchObject({
      normalizedText: '41 05 5A'
    })

    await awaitDisconnect(transport)
    await selectAndConnect(transport)

    const second = executor.execute('010D')
    await vi.advanceTimersByTimeAsync(150)
    await expect(second).resolves.toMatchObject({
      normalizedText: '41 0D 00'
    })

    executor.dispose()
  })
})
