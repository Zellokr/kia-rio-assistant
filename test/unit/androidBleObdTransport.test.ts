import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import type {
  AndroidBleBridge,
  AndroidBleConnectOptions,
  AndroidBleDevice,
  AndroidBleProfile
} from '../../core/bluetooth/AndroidBleBridge'
import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { AndroidBleObdTransport } from '../../core/obd/transport/AndroidBleObdTransport'

/** Synthetic UUIDs for unit tests only — not VEEPEAK inventory values. */
const SYNTHETIC_PROFILE: AndroidBleProfile = {
  serviceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
  writeCharacteristicUuid: '0000fff2-0000-1000-8000-00805f9b34fb',
  notifyCharacteristicUuid: '0000fff1-0000-1000-8000-00805f9b34fb'
}

class FakeAndroidBleBridge implements AndroidBleBridge {
  supported = true

  device: AndroidBleDevice = {
    id: 'ble-device-1',
    name: 'Synthetic BLE adapter'
  }

  connectCalls: AndroidBleConnectOptions[] = []

  writes: Uint8Array[] = []

  disconnectCalls = 0

  requestCalls = 0

  private readonly listeners = new Set<
    (data: Uint8Array) => void
  >()

  private connected = false

  isSupported(): boolean {
    return this.supported
  }

  async requestDevice(): Promise<AndroidBleDevice> {
    this.requestCalls++
    return this.device
  }

  async connect(options: AndroidBleConnectOptions): Promise<void> {
    this.connectCalls.push(options)
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls++
    this.connected = false
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.connected) {
      throw new Error('Fake Android BLE bridge is not connected')
    }

    this.writes.push(data.slice())
  }

  subscribe(
    listener: (data: Uint8Array) => void
  ): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(rawText: string): void {
    const bytes = new TextEncoder().encode(rawText)

    for (const listener of this.listeners) {
      listener(bytes)
    }
  }
}

function createTransport(
  bridge = new FakeAndroidBleBridge(),
  profile: AndroidBleProfile | undefined = SYNTHETIC_PROFILE
) {
  return {
    bridge,
    transport: new AndroidBleObdTransport({ bridge, profile })
  }
}

describe('AndroidBleObdTransport', () => {
  it('requires a supported bridge and fails with an actionable message otherwise', async () => {
    const bridge = new FakeAndroidBleBridge()
    bridge.supported = false
    const { transport } = createTransport(bridge)

    await expect(transport.select()).rejects.toThrow(
      'Capacitor Android app'
    )
    expect(transport.state).toBe('error')
  })

  it('selects a device and connects only after a non-empty BLE profile is supplied', async () => {
    const bridge = new FakeAndroidBleBridge()
    const missingProfile = new AndroidBleObdTransport({ bridge })

    await expect(missingProfile.select()).resolves.toMatchObject({
      kind: 'android-ble',
      name: 'Synthetic BLE adapter'
    })
    await expect(missingProfile.connect()).rejects.toThrow(
      'Android BLE profile UUIDs are required'
    )
    expect(missingProfile.state).toBe('error')

    const { transport } = createTransport(bridge)

    await transport.select()
    await expect(transport.connect()).resolves.toMatchObject({
      kind: 'android-ble'
    })

    expect(bridge.connectCalls).toEqual([{
      deviceId: 'ble-device-1',
      profile: SYNTHETIC_PROFILE
    }])
    expect(transport.state).toBe('connected')
  })

  it('serializes writes through the bridge and enforces the physical allowlist', async () => {
    const { bridge, transport } = createTransport()

    await transport.select()
    await transport.connect()

    await transport.write(new TextEncoder().encode('010C\r'))
    expect(bridge.writes.map(bytes => new TextDecoder().decode(bytes)))
      .toEqual(['010C\r'])

    await expect(
      transport.write(new TextEncoder().encode('04\r'))
    ).rejects.toThrow('not allowed')
    expect(bridge.writes).toHaveLength(1)
    expect(transport.state).toBe('connected')
  })

  it('forwards fragmented RX chunks from the bridge without decoding them', async () => {
    const { bridge, transport } = createTransport()
    const chunks: string[] = []

    transport.subscribe((chunk) => {
      chunks.push(new TextDecoder().decode(chunk))
    })

    await transport.select()
    await transport.connect()

    bridge.emit('41 0')
    bridge.emit('C 1A F8\r>')

    expect(chunks).toEqual(['41 0', 'C 1A F8\r>'])
  })

  it('stops delivering RX after disconnect and notifies state listeners', async () => {
    const { bridge, transport } = createTransport()
    const states: string[] = []
    const chunks: string[] = []

    transport.subscribeState(state => states.push(state))
    transport.subscribe((chunk) => {
      chunks.push(new TextDecoder().decode(chunk))
    })

    await transport.select()
    await transport.connect()
    bridge.emit('41 0')

    await transport.disconnect()

    expect(transport.state).toBe('disconnected')
    expect(bridge.disconnectCalls).toBe(1)
    expect(states).toContain('disconnecting')
    expect(states).toContain('disconnected')

    bridge.emit('C 1A F8\r>')
    expect(chunks).toEqual(['41 0'])
  })

  it('supports select→connect→disconnect→reconnect without one-shot bridge state', async () => {
    const { bridge, transport } = createTransport()

    await transport.select()
    await transport.connect()
    await transport.write(new TextEncoder().encode('0105\r'))
    await transport.disconnect()

    await transport.select()
    await transport.connect()
    await transport.write(new TextEncoder().encode('0105\r'))

    expect(bridge.requestCalls).toBe(2)
    expect(bridge.connectCalls).toHaveLength(2)
    expect(bridge.writes).toHaveLength(2)
    expect(transport.state).toBe('connected')
  })

  it('rejects in-flight executor commands immediately when the transport disconnects', async () => {
    const { bridge, transport } = createTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)
    const inFlight = executor.execute('010C', 5_000)

    await Promise.resolve()
    bridge.emit('41 0')

    await transport.disconnect()

    await expect(inFlight).rejects.toThrow(
      'OBD transport is not connected'
    )

    executor.dispose()
  })

  it('feeds fragmented bridge bytes through ElmCommandExecutor', async () => {
    const { bridge, transport } = createTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)
    const result = executor.execute('010C')

    await vi.waitFor(() => {
      expect(bridge.writes).toHaveLength(1)
    })

    bridge.emit('41 0')
    bridge.emit('C 1A F8\r>')

    await expect(result).resolves.toMatchObject({
      command: '010C',
      normalizedText: '41 0C 1A F8'
    })

    executor.dispose()
  })
})
