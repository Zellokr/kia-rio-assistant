import {
  Capacitor,
  registerPlugin
} from '@capacitor/core'
import type {
  AndroidBleBridge,
  AndroidBleConnectOptions,
  AndroidBleDevice
} from '~~/core/bluetooth/AndroidBleBridge'
import {
  base64ToBytes,
  bytesToBase64
} from '~~/core/bluetooth/base64Bytes'

interface NativeBleObdBridgePlugin {
  requestDevice(): Promise<AndroidBleDevice>
  connect(options: {
    deviceId: string
    serviceUuid: string
    writeCharacteristicUuid: string
    notifyCharacteristicUuid: string
  }): Promise<void>
  write(options: { data: string }): Promise<void>
  disconnect(): Promise<void>
  addListener(
    event: 'rx',
    listener: (payload: { data: string }) => void
  ): Promise<{ remove: () => Promise<void> }>
}

const NativeBleObdBridge
  = registerPlugin<NativeBleObdBridgePlugin>('BleObdBridge')

/**
 * Capacitor-facing Android BLE OBD bridge.
 *
 * The profile UUIDs are flattened here because Capacitor marshals plugin
 * options as plain JSON; the native side re-validates that all three are
 * present rather than trusting this layer.
 */
export const capacitorAndroidBle: AndroidBleBridge = {
  isSupported: () => (
    Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android'
  ),
  requestDevice: () => NativeBleObdBridge.requestDevice(),
  async connect(options: AndroidBleConnectOptions) {
    await NativeBleObdBridge.connect({
      deviceId: options.deviceId,
      serviceUuid: options.profile.serviceUuid,
      writeCharacteristicUuid: options.profile.writeCharacteristicUuid,
      notifyCharacteristicUuid: options.profile.notifyCharacteristicUuid
    })
  },
  async disconnect() {
    await NativeBleObdBridge.disconnect()
  },
  async write(data: Uint8Array) {
    await NativeBleObdBridge.write({ data: bytesToBase64(data) })
  },
  subscribe(listener: (data: Uint8Array) => void) {
    // addListener resolves asynchronously but the transport contract is
    // synchronous, so the handle is awaited inside the returned disposer. A
    // disconnect that lands before registration completes must still remove
    // the listener, otherwise a stale subscription survives the session.
    let removed = false
    const handle = NativeBleObdBridge.addListener('rx', (payload) => {
      if (removed) {
        return
      }

      listener(base64ToBytes(payload.data))
    })

    return () => {
      removed = true
      void handle.then(subscription => subscription.remove()).catch(() => undefined)
    }
  }
}
