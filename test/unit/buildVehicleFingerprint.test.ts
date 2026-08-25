import { describe, expect, it } from 'vitest'
import { buildVehicleFingerprint } from '../../core/obd/capability/buildVehicleFingerprint'

describe('buildVehicleFingerprint', () => {
  it('uses only normalized transport metadata and the range-zero mask', () => {
    expect(buildVehicleFingerprint(
      { kind: 'android-ble', name: ' Veepeak ' },
      '41 00 be 3f a8 13'
    )).toBe('android-ble:veepeak:BE3FA813')
  })

  it('keeps an unnamed adapter VIN-free', () => {
    expect(buildVehicleFingerprint({ kind: 'mock' }, 'BE3FA813'))
      .toBe('mock::BE3FA813')
  })
})
