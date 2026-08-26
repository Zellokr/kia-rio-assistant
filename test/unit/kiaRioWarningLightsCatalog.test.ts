import {
  describe,
  expect,
  it
} from 'vitest'

import {
  KIA_RIO_WARNING_LIGHTS,
  kiaRioWarningLightsCatalog
} from '../../catalog/kia-rio/warning-lights'
import { DIAGNOSTIC_SEVERITY_ORDER } from '../../core/obd/diagnostics/ports'
import { parseDtcCode } from '../../core/obd/dtc/DtcCode'

const WARNING_LIGHT_COLORS = [
  'red',
  'amber',
  'green',
  'blue',
  'white'
]

describe('Kia Rio warning-light catalogue', () => {
  it('serves every entry and looks one up by id', () => {
    expect(kiaRioWarningLightsCatalog.all()).toEqual(
      KIA_RIO_WARNING_LIGHTS
    )
    expect(
      kiaRioWarningLightsCatalog.byId('check-engine')?.id
    ).toBe('check-engine')
    expect(
      kiaRioWarningLightsCatalog.byId('no-such-light')
    ).toBeUndefined()
  })

  it('gives every light a unique id', () => {
    const ids = KIA_RIO_WARNING_LIGHTS.map(entry => entry.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('fills every spec §11.1 attribute', () => {
    for (const entry of KIA_RIO_WARNING_LIGHTS) {
      expect(entry.id.trim().length).toBeGreaterThan(0)
      expect(entry.name.trim().length).toBeGreaterThan(0)
      expect(WARNING_LIGHT_COLORS).toContain(entry.color)
      expect(entry.shape.trim().length).toBeGreaterThan(0)
      expect(entry.behavior.length).toBeGreaterThan(0)
      expect(DIAGNOSTIC_SEVERITY_ORDER).toContain(entry.severity)
      expect(entry.immediateAction.trim().length).toBeGreaterThan(0)
      expect(entry.recommendedChecks.length).toBeGreaterThan(0)
      expect(entry.subsystems.length).toBeGreaterThan(0)
    }
  })

  /**
   * RF-025: every declared association must be a code or prefix a DTC can
   * actually have. A typo here would silently stop associating rather than
   * associate the wrong thing, which is the quieter and worse failure.
   */
  it('declares only well-formed DTC codes and prefixes', () => {
    for (const entry of KIA_RIO_WARNING_LIGHTS) {
      for (const code of entry.associatedDtcCodes) {
        expect(() => parseDtcCode(code)).not.toThrow()
      }

      for (const prefix of entry.associatedDtcPrefixes) {
        expect(prefix).toMatch(/^[PCBU][0-3][0-9A-F]{0,2}$/)
      }
    }
  })

  it('tells the driver to stop for every critical light', () => {
    const criticals = KIA_RIO_WARNING_LIGHTS.filter(
      entry => entry.severity === 'critical'
    )

    expect(criticals.length).toBeGreaterThan(0)

    for (const entry of criticals) {
      expect(entry.immediateAction.toLowerCase()).toMatch(
        /det[eé]n|deja de conducir|no sigas conduciendo|no arranques/
      )
    }
  })

  it('leaves the RF-028 applicability seam unpopulated', () => {
    for (const entry of KIA_RIO_WARNING_LIGHTS) {
      expect(entry.applicability).toBeUndefined()
    }
  })

  /**
   * The guided flow narrows on colour, shape and behaviour. If two entries
   * are identical across all three they can never be told apart, and the
   * flow would dead-end on `candidates` with no question left to ask.
   */
  it('keeps every light distinguishable by the guided questions', () => {
    const fingerprints = KIA_RIO_WARNING_LIGHTS.map(entry =>
      [
        entry.color,
        entry.shape,
        [...entry.behavior].sort().join('+')
      ].join('|')
    )

    expect(new Set(fingerprints).size).toBe(fingerprints.length)
  })
})
