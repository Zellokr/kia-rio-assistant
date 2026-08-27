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

  /**
   * The guided flow narrows on colour, then shape, then behaviour. Two
   * entries sharing all three cannot be told apart by any answer a driver
   * can give, so the flow would have to pick one and would sometimes pick
   * wrong. Adding entries is what breaks this: `check-engine` and
   * `check-engine-blinking` share a colour and a shape, and so do the two
   * GPF entries — behaviour is the only thing keeping each pair apart.
   *
   * This compares one behaviour at a time rather than fingerprinting the
   * whole array, which is what it replaces. Joining the array left a hole:
   * an entry listing both behaviours produced `blinking+steady` and so
   * never collided with a `steady` entry it would in fact be
   * indistinguishable from for a driver who answered "fija".
   */
  it('leaves no two lights answering the same description', () => {
    const byDescription = new Map<string, string[]>()

    for (const entry of KIA_RIO_WARNING_LIGHTS) {
      for (const behavior of entry.behavior) {
        const key = `${entry.color}|${entry.shape}|${behavior}`

        byDescription.set(key, [...(byDescription.get(key) ?? []), entry.id])
      }
    }

    expect(
      [...byDescription.values()].filter(ids => ids.length > 1)
    ).toEqual([])
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
   * The three tell-tales the owner's manual names inside this project's
   * engine and emissions scope. They were absent while the catalogue held
   * only the ISO 2575 standard set; see
   * `docs/WARNING_LIGHT_CATALOG_VERIFICATION.md`.
   */
  describe('the manual-specific tell-tales', () => {
    it('covers the gasoline particulate filter, steady and blinking', () => {
      const steady = kiaRioWarningLightsCatalog.byId('exhaust-gpf')
      const blinking = kiaRioWarningLightsCatalog.byId(
        'exhaust-gpf-blinking'
      )

      expect(steady?.behavior).toEqual(['steady'])
      expect(blinking?.behavior).toEqual(['blinking'])
      expect(steady?.subsystems).toContain('emissions')
      expect(blinking?.subsystems).toContain('emissions')
    })

    /**
     * The manual's own distinction, and the reason these are two entries:
     * a steady lamp is cleared by a regeneration drive, a blinking one is
     * a workshop visit. Collapsing them would give one of the two the
     * wrong advice.
     */
    it('sends a steady filter lamp driving and a blinking one to a workshop', () => {
      expect(kiaRioWarningLightsCatalog.byId('exhaust-gpf')?.immediateAction)
        .toContain('80 km/h')
      expect(
        kiaRioWarningLightsCatalog.byId('exhaust-gpf-blinking')
          ?.immediateAction
      ).toContain('taller')
    })

    /**
     * Oil level is not oil pressure. Two lamps, two failures: low pressure
     * means stop the engine now, low level means top it up soon. Sharing a
     * severity would push one of them to the wrong urgency.
     */
    it('separates engine oil level from oil pressure', () => {
      const level = kiaRioWarningLightsCatalog.byId('engine-oil-level')
      const pressure = kiaRioWarningLightsCatalog.byId('oil-pressure')

      expect(level?.severity).toBe('warning')
      expect(pressure?.severity).toBe('critical')
      expect(level?.shape).not.toBe(pressure?.shape)
    })

    /**
     * The master warning names no fault of its own — it defers to the LCD
     * message, so its advice has to send the driver there rather than
     * guess which of the systems behind it is at fault.
     */
    it('sends the master warning to the instrument display', () => {
      const master = kiaRioWarningLightsCatalog.byId('master-warning')

      expect(master?.immediateAction.toLowerCase()).toContain('pantalla')
      expect(master?.severity).toBe('warning')
    })
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
})
