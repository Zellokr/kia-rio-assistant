import { describe, expect, it } from 'vitest'

import type { ObdTransportMetadata } from '../../core/obd/transport/ObdTransport'
import {
  PHYSICAL_TRANSPORT_KINDS,
  isPhysicalTransportKind
} from '../../core/obd/transport/ObdTransport'

type Kind = ObdTransportMetadata['kind']

const ALL_KINDS: Kind[] = [
  'mock',
  'replay',
  'web-serial-rfcomm',
  'android-ble'
]

describe('isPhysicalTransportKind', () => {
  it('treats every transport that reaches real hardware as physical', () => {
    expect(isPhysicalTransportKind('web-serial-rfcomm')).toBe(true)
    expect(isPhysicalTransportKind('android-ble')).toBe(true)
  })

  it('treats synthetic transports as non-physical', () => {
    expect(isPhysicalTransportKind('mock')).toBe(false)
    expect(isPhysicalTransportKind('replay')).toBe(false)
  })

  /**
   * A new transport kind must be classified deliberately. Without this, adding
   * one silently defaults it to "simulated" and every physical safety gate
   * keyed on this predicate quietly stops applying to it.
   */
  it('classifies every declared transport kind', () => {
    for (const kind of ALL_KINDS) {
      expect(typeof isPhysicalTransportKind(kind)).toBe('boolean')
    }

    expect(ALL_KINDS.filter(isPhysicalTransportKind).sort())
      .toEqual([...PHYSICAL_TRANSPORT_KINDS].sort())
  })
})
