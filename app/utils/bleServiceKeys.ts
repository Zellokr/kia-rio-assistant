import type { InjectionKey } from 'vue'

import type {
  AndroidBleBridge
} from '~~/core/bluetooth/AndroidBleBridge'
import type {
  GattInspectorBridge
} from '~~/core/bluetooth/GattInspectorController'
import { capacitorAndroidBle } from '~/services/capacitorAndroidBle'
import {
  capacitorGattInspector
} from '~/services/capacitorGattInspector'

/**
 * The seams that let a caller decide which Bluetooth bridge the diagnostic
 * panels talk to.
 *
 * `GattInspectorPanel` and `ElmPipeProbePanel` used to name their Capacitor
 * services directly. Both services report unsupported off the Android shell,
 * so a mounted panel could only ever render its "open this from the app"
 * branch — every control, every result and every error path was unreachable
 * from a test, and the suite fell back to matching the panels' own source
 * text. Matching a string proves a line was typed, not that a button works.
 *
 * Same shape as `labTransportFactoryKey`: production injects nothing and gets
 * the Capacitor service, and a caller that provides its own is responsible
 * for what it hands back.
 *
 * The BLE profile is deliberately not a seam. It is reviewed UUID data with
 * no platform behaviour, it works unchanged in a test, and making it
 * injectable would invite a test to pass UUIDs the device never confirmed.
 */
export const gattInspectorBridgeKey: InjectionKey<GattInspectorBridge>
  = Symbol('gatt-inspector-bridge')

export const androidBleBridgeKey: InjectionKey<AndroidBleBridge>
  = Symbol('android-ble-bridge')

export const defaultGattInspectorBridge: GattInspectorBridge
  = capacitorGattInspector

export const defaultAndroidBleBridge: AndroidBleBridge = capacitorAndroidBle
