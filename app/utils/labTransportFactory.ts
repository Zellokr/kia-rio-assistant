import type { InjectionKey } from 'vue'

import { AndroidBleObdTransport } from '~~/core/obd/transport/AndroidBleObdTransport'
import type { ObdTransport } from '~~/core/obd/transport/ObdTransport'
import { capacitorAndroidBle } from '~/services/capacitorAndroidBle'
import { VEEPEAK_BLE_PROFILE } from '~/services/veepeakBleProfile'
import type { ObdTransportChoice } from '~/utils/obdTransportChoice'

export type LabTransportFactory
  = (choice: ObdTransportChoice) => ObdTransport

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
  choice: ObdTransportChoice
): ObdTransport {
  if (choice !== 'android-ble') {
    throw new Error('Transporte no disponible en la aplicación')
  }

  return new AndroidBleObdTransport({
    bridge: capacitorAndroidBle,
    profile: VEEPEAK_BLE_PROFILE
  })
}

/**
 * Whether the URL is asking a development build to talk to a mock adapter
 * instead of the Android bridge, which is the only way to work on the page
 * away from the car: without it every selection fails at the bridge and
 * nothing past the connection view can be reached by hand.
 *
 * Two gates, both required. Off unless the build is a development one, and
 * off unless the URL asks — a mock answering inside a shipped build would
 * render numbers that look like a vehicle and are not, which is the one
 * failure this project cannot afford.
 *
 * This decides; it does not build. The adapter itself is imported
 * dynamically by the plugin, behind a check that folds to a constant at
 * build time, so `MockObdTransport` is absent from a production bundle
 * rather than merely unreachable inside it.
 */
export function shouldUseDevMockTransport(
  search: string,
  isDevelopment: boolean
): boolean {
  if (!isDevelopment) {
    return false
  }

  return new URLSearchParams(search).get('transport') === 'mock'
}
