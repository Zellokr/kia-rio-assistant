import type {
  AndroidBleBridge,
  AndroidBleConnectOptions,
  AndroidBleDevice
} from '../../../core/bluetooth/AndroidBleBridge'

/**
 * Shared fake Android BLE bridge for unit tests.
 *
 * Used both by `androidBleObdTransport.test.ts` (transport unit coverage)
 * and `physicalReadOnlyPolicyIntegration.test.ts` (the read-only policy
 * boundary proof), so the two suites exercise `AndroidBleObdTransport`
 * against one consistent fake rather than two drifting copies.
 */
export class Deferred<T> {
  readonly promise: Promise<T>

  resolve!: (value: T) => void

  reject!: (reason: unknown) => void

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

export class FakeAndroidBleBridge implements AndroidBleBridge {
  supported = true

  device: AndroidBleDevice = {
    id: 'ble-device-1',
    name: 'Synthetic BLE adapter'
  }

  connectCalls: AndroidBleConnectOptions[] = []

  writes: Uint8Array[] = []

  disconnectCalls = 0

  requestCalls = 0

  blockConnect = false

  readonly pendingConnects: Array<Deferred<void>> = []

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

    if (this.blockConnect) {
      const deferred = new Deferred<void>()

      this.pendingConnects.push(deferred)
      await deferred.promise
    }

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
