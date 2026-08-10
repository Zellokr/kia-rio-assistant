import {
  Capacitor
} from '@capacitor/core'
import type {
  AndroidBleBridge
} from '~~/core/bluetooth/AndroidBleBridge'

const PENDING_INVENTORY_MESSAGE
  = 'Android BLE OBD native bridge is not implemented yet. Capture and review a VEEPEAK GATT inventory (Step 19) before enabling real UUID, RX/TX, or notifications.'

/**
 * Capacitor-facing stub for the Android BLE OBD bridge.
 *
 * `isSupported()` is true only on native Android so the contract surface can
 * be detected, but every I/O method throws until a real plugin exists after
 * Step 19 inventory review. Unit tests inject a fake bridge instead.
 */
export const capacitorAndroidBle: AndroidBleBridge = {
  isSupported: () => (
    Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android'
  ),
  async requestDevice() {
    throw new Error(PENDING_INVENTORY_MESSAGE)
  },
  async connect() {
    throw new Error(PENDING_INVENTORY_MESSAGE)
  },
  async disconnect() {
    throw new Error(PENDING_INVENTORY_MESSAGE)
  },
  async write() {
    throw new Error(PENDING_INVENTORY_MESSAGE)
  },
  subscribe() {
    throw new Error(PENDING_INVENTORY_MESSAGE)
  }
}
