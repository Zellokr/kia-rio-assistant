import {
  Capacitor,
  registerPlugin
} from '@capacitor/core'
import type {
  GattDevice,
  GattInspectorBridge,
  GattInventory
} from '~~/core/bluetooth/GattInspectorController'

interface NativeGattInspectorPlugin {
  scan(): Promise<{ devices: GattDevice[] }>
  inspect(options: { deviceId: string }): Promise<GattInventory>
  disconnect(): Promise<void>
}

const NativeGattInspector
  = registerPlugin<NativeGattInspectorPlugin>('GattInspector')

export const capacitorGattInspector: GattInspectorBridge = {
  isSupported: () => (
    Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android'
  ),
  async scan() {
    const result = await NativeGattInspector.scan()

    return result.devices
  },
  inspect: options => NativeGattInspector.inspect(options),
  disconnect: async () => {
    await NativeGattInspector.disconnect()
  }
}
