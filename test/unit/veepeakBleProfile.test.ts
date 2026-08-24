import { describe, expect, it } from 'vitest'

import { assertAndroidBleProfile } from '../../core/bluetooth/AndroidBleBridge'
import {
  VEEPEAK_BLE_PROFILE,
  VEEPEAK_INVENTORY_PROVENANCE
} from '../../app/services/veepeakBleProfile'

/**
 * UUIDs rejected during the Step 19 inventory review. Locking them here keeps a
 * later "cleanup" from quietly re-selecting a channel the review excluded.
 */
const EXCLUDED = {
  /** Telink module boilerplate, also seen on unrelated gamepads and remotes. */
  telinkService: '00006287-3c17-d293-8e48-14fe2e4da212',
  telinkConfigService: '0000d0ff-3c17-d293-8e48-14fe2e4da212',
  /** CCCD UUID that this firmware wrongly exposes as a characteristic. */
  malformedNotify: '00002902-0000-1000-8000-00805f9b34fb'
} as const

describe('VEEPEAK_BLE_PROFILE', () => {
  it('binds the reviewed serial pipe from the captured inventory', () => {
    expect(VEEPEAK_BLE_PROFILE).toEqual({
      serviceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
      writeCharacteristicUuid: '0000fff2-0000-1000-8000-00805f9b34fb',
      notifyCharacteristicUuid: '0000fff1-0000-1000-8000-00805f9b34fb'
    })
  })

  it('satisfies the transport profile contract', () => {
    expect(assertAndroidBleProfile(VEEPEAK_BLE_PROFILE))
      .toEqual(VEEPEAK_BLE_PROFILE)
  })

  it('uses lowercase 128-bit UUIDs so captures stay comparable', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

    expect(VEEPEAK_BLE_PROFILE.serviceUuid).toMatch(uuid)
    expect(VEEPEAK_BLE_PROFILE.writeCharacteristicUuid).toMatch(uuid)
    expect(VEEPEAK_BLE_PROFILE.notifyCharacteristicUuid).toMatch(uuid)
  })

  it('never selects a Telink module service as the OBD pipe', () => {
    expect(VEEPEAK_BLE_PROFILE.serviceUuid)
      .not.toBe(EXCLUDED.telinkService)
    expect(VEEPEAK_BLE_PROFILE.serviceUuid)
      .not.toBe(EXCLUDED.telinkConfigService)
  })

  it('never selects the malformed CCCD-as-characteristic for notifications', () => {
    expect(VEEPEAK_BLE_PROFILE.notifyCharacteristicUuid)
      .not.toBe(EXCLUDED.malformedNotify)
  })

  it('keeps the write and notify channels distinct', () => {
    expect(VEEPEAK_BLE_PROFILE.writeCharacteristicUuid)
      .not.toBe(VEEPEAK_BLE_PROFILE.notifyCharacteristicUuid)
  })

  it('records the capture this profile was reviewed from', () => {
    expect(VEEPEAK_INVENTORY_PROVENANCE).toMatchObject({
      capturedOn: '2026-08-24',
      advertisedName: 'VEEPEAK',
      roundTripConfirmed: false
    })
  })
})
