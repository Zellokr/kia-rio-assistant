import type { AndroidBleProfile } from '~~/core/bluetooth/AndroidBleBridge'

/**
 * Where this profile comes from, so a reader never has to guess whether the
 * UUIDs below were reviewed or invented.
 *
 * `roundTripConfirmed` stays false until a real ATZ write is answered by the
 * adapter over the notify channel. Reviewed is not the same as proven.
 */
export interface VeepeakInventoryProvenance {
  capturedOn: string
  advertisedName: string
  capturedWith: string
  roundTripConfirmed: boolean
}

export const VEEPEAK_INVENTORY_PROVENANCE: VeepeakInventoryProvenance = {
  capturedOn: '2026-08-24',
  advertisedName: 'VEEPEAK',
  capturedWith: 'Google Pixel 9A, Android 17',
  roundTripConfirmed: false
}

/**
 * Serial-over-BLE pipe selected from the reviewed Step 19 GATT inventory.
 *
 * This constant lives in the application layer on purpose. The core transport
 * still takes the profile by injection and ships no vendor default, so nothing
 * under `core/` hardcodes a VEEPEAK UUID.
 *
 * Selection evidence, in order of authority:
 *
 * 1. The adapter's own advertised properties. Under service `fff0`, `fff2`
 *    exposes write + writeWithoutResponse and `fff1` exposes notify with a
 *    real CCCD (`2902`). Properties decide direction; a notify characteristic
 *    cannot be the command channel.
 * 2. An independent ELM327-over-BLE implementation documents this exact
 *    triple as its Veepeak "Variant B".
 *
 * Rejected during review, and why:
 *
 * - `00006287-3c17-d293-8e48-14fe2e4da212` and
 *   `0000d0ff-3c17-d293-8e48-14fe2e4da212` share a Telink module UUID base
 *   that also appears on unrelated hardware (a gamepad, a TV remote). They are
 *   chipset boilerplate, not an OBD pipe. `d0ff` has no notify characteristic
 *   at all, so it cannot carry responses.
 * - `00001801` / `00002a05` is the standard Service Changed indication.
 * - Service `fff0` also exposes a characteristic whose UUID is the CCCD
 *   `00002902` with notify set and no descriptor. That is a firmware defect.
 *   Never bind it; `fff1` is the notify channel.
 *
 * Characteristic `fff1` also exists under `d0ff` as read-only, so a consumer
 * must always bind by service + characteristic pair, never by characteristic
 * UUID alone.
 */
export const VEEPEAK_BLE_PROFILE: AndroidBleProfile = {
  serviceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
  writeCharacteristicUuid: '0000fff2-0000-1000-8000-00805f9b34fb',
  notifyCharacteristicUuid: '0000fff1-0000-1000-8000-00805f9b34fb'
}
