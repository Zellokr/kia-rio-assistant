import type {
  AndroidBleBridge,
  AndroidBleDevice,
  AndroidBleProfile
} from '../../bluetooth/AndroidBleBridge'
import { assertAndroidBleProfile } from '../../bluetooth/AndroidBleBridge'
import { assertPhysicalCommandAllowed } from '../policy/PhysicalObdCommandPolicy'
import type {
  ObdTransport,
  ObdTransportMetadata,
  ObdTransportState
} from './ObdTransport'

export interface AndroidBleObdTransportOptions {
  bridge: AndroidBleBridge
  /**
   * Opaque GATT UUIDs. Required for connect(); must come from a reviewed
   * Step 19 inventory — never invent VEEPEAK defaults in application code.
   */
  profile?: AndroidBleProfile
}

/**
 * ObdTransport over a future Android BLE native bridge.
 *
 * Protocol parsing and ELM initialization stay above this boundary. Physical
 * read-only command policy is enforced in write(). Real characteristic
 * notify/write lives in the native bridge once the VEEPEAK inventory exists;
 * until then only a fake bridge is used in unit tests.
 */
export class AndroidBleObdTransport implements ObdTransport {
  readonly kind = 'android-ble' as const

  state: ObdTransportState = 'idle'

  private readonly listeners = new Set<
    (data: Uint8Array) => void
  >()

  private readonly stateListeners = new Set<
    (state: ObdTransportState) => void
  >()

  private readonly bridge: AndroidBleBridge

  private readonly profile: AndroidBleProfile | undefined

  private device: AndroidBleDevice | undefined

  private unsubscribeBridge: (() => void) | undefined

  private writeTail: Promise<void> = Promise.resolve()

  private disconnectTask: Promise<void> | undefined

  constructor(options: AndroidBleObdTransportOptions) {
    this.bridge = options.bridge
    this.profile = options.profile
  }

  async select(): Promise<ObdTransportMetadata> {
    if (
      this.state === 'connecting'
      || this.state === 'connected'
      || this.state === 'disconnecting'
    ) {
      throw new Error(
        'Disconnect the current Android BLE adapter before selecting another'
      )
    }

    this.setState('selecting')

    try {
      this.assertSupported()
      // Profile is validated at connect time, not here, so selecting still
      // works before the reviewed UUIDs are wired in.
      //
      // There is no picker to exercise: the native bridge scans for five
      // seconds and resolves the first VEEPEAK it finds. This comment used
      // to say otherwise, and the UI copy that trusted it told drivers to
      // choose from a list that never appears.
      this.device = await this.bridge.requestDevice()
      this.setState('selected')

      return this.metadata()
    } catch (error) {
      this.setState('error')
      throw this.toError(error)
    }
  }

  async connect(): Promise<ObdTransportMetadata> {
    if (!this.device) {
      throw new Error('Select an Android BLE adapter before connecting')
    }
    if (this.state !== 'selected' && this.state !== 'disconnected') {
      throw new Error(
        'Android BLE transport must be selected before connecting'
      )
    }

    this.setState('connecting')

    try {
      this.assertSupported()
      const profile = assertAndroidBleProfile(this.profile)

      await this.bridge.connect({
        deviceId: this.device.id,
        profile
      })

      // A disconnect requested while the BLE link was opening (pairing + GATT
      // discovery are slow) already moved us out of 'connecting'. Honour it
      // instead of resurrecting a phantom 'connected' session with a live
      // bridge subscription.
      const stateAfterConnect = this.state as ObdTransportState

      if (stateAfterConnect !== 'connecting') {
        throw new Error(
          'Android BLE connect was cancelled by a concurrent disconnect'
        )
      }

      this.unsubscribeBridge?.()
      this.unsubscribeBridge = this.bridge.subscribe((chunk) => {
        if (this.state !== 'connected') {
          return
        }

        this.emit(chunk)
      })

      this.setState('connected')

      return this.metadata()
    } catch (error) {
      // Preserve a concurrent disconnect's terminal state; only a genuine
      // connect failure (still 'connecting') escalates to 'error'.
      const stateOnFailure = this.state as ObdTransportState

      if (stateOnFailure === 'connecting') {
        this.setState('error')
      }

      await this.cleanupBridgeSubscription()
      throw this.toError(error)
    }
  }

  disconnect(): Promise<void> {
    if (this.state === 'disconnected') {
      return Promise.resolve()
    }
    if (this.disconnectTask) {
      return this.disconnectTask
    }

    this.disconnectTask = this.performDisconnect()
      .finally(() => {
        this.disconnectTask = undefined
      })

    return this.disconnectTask
  }

  private async performDisconnect(): Promise<void> {
    this.setState('disconnecting')

    try {
      await this.writeTail.catch(() => undefined)
      await this.cleanupBridgeSubscription()
      await this.bridge.disconnect()
      this.setState('disconnected')
    } catch (error) {
      this.setState('error')
      throw this.toError(error)
    }
  }

  write(data: Uint8Array): Promise<void> {
    const bytes = data.slice()
    const task = this.writeTail
      .catch(() => undefined)
      .then(async () => {
        const command = new TextDecoder().decode(bytes).trim()

        assertPhysicalCommandAllowed(command)

        if (this.state !== 'connected') {
          throw new Error('OBD transport is not connected')
        }

        try {
          await this.bridge.write(bytes)
        } catch (error) {
          if (this.state === 'connected') {
            this.setState('error')
          }

          throw this.toError(error)
        }
      })

    this.writeTail = task
    return task
  }

  subscribe(
    listener: (data: Uint8Array) => void
  ): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeState(
    listener: (state: ObdTransportState) => void
  ): () => void {
    this.stateListeners.add(listener)

    return () => {
      this.stateListeners.delete(listener)
    }
  }

  private assertSupported(): void {
    if (!this.bridge.isSupported()) {
      throw new Error(
        'Android BLE OBD is available only in the Capacitor Android app after a reviewed VEEPEAK GATT inventory supplies the BLE profile UUIDs.'
      )
    }
  }

  private async cleanupBridgeSubscription(): Promise<void> {
    this.unsubscribeBridge?.()
    this.unsubscribeBridge = undefined
  }

  private metadata(): ObdTransportMetadata {
    return {
      kind: this.kind,
      name: this.device?.name?.trim()
        || 'Android BLE OBD adapter'
    }
  }

  private setState(next: ObdTransportState): void {
    if (this.state === next) {
      return
    }

    this.state = next

    for (const listener of this.stateListeners) {
      try {
        listener(next)
      } catch {
        // State observers must not break transport transitions.
      }
    }
  }

  private emit(data: Uint8Array): void {
    for (const listener of this.listeners) {
      listener(data)
    }
  }

  private toError(error: unknown): Error {
    return error instanceof Error
      ? error
      : new Error(String(error))
  }
}
