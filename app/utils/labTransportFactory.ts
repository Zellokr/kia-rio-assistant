import type { InjectionKey } from 'vue'

import { AndroidBleObdTransport } from '~~/core/obd/transport/AndroidBleObdTransport'
import type { ObdTransport } from '~~/core/obd/transport/ObdTransport'
import { capacitorAndroidBle } from '~/services/capacitorAndroidBle'
import { VEEPEAK_BLE_PROFILE } from '~/services/veepeakBleProfile'
import type { ConnectionTransportChoice } from '~/components/ConnectionView.vue'

export type LabTransportFactory
  = (choice: ConnectionTransportChoice) => ObdTransport

/**
 * The seam that lets a caller decide which transport the lab page talks to.
 *
 * The page used to build its transports inline, which meant nothing outside
 * the Android shell could ever reach a connected session — a test could not
 * observe anything past a failed selection, and offline development had no
 * way in that did not involve dead code inside the page.
 *
 * Production leaves this alone and gets `createLabTransport`. A caller that
 * provides its own is responsible for what it hands back.
 */
export const labTransportFactoryKey: InjectionKey<LabTransportFactory>
  = Symbol('lab-transport-factory')

/**
 * Android BLE is the only transport the application ships. Every other value
 * the prop type still admits fails loudly rather than selecting nothing.
 */
export function createLabTransport(
  choice: ConnectionTransportChoice
): ObdTransport {
  if (choice !== 'android-ble') {
    throw new Error('Transporte no disponible en la aplicación')
  }

  return new AndroidBleObdTransport({
    bridge: capacitorAndroidBle,
    profile: VEEPEAK_BLE_PROFILE
  })
}
