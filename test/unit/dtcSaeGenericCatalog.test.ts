import {
  describe,
  expect,
  it
} from 'vitest'

import {
  SAE_GENERIC_DTC_ENTRIES,
  saeGenericDtcCatalog
} from '../../catalog/dtc-sae-generic'
import type { DtcCatalog } from '../../core/obd/diagnostics/ports'
import { parseDtcCode } from '../../core/obd/dtc/DtcCode'

const catalog: DtcCatalog = saeGenericDtcCatalog

/**
 * SAE J2012 generic powertrain codes only. `P0` is the sole SAE-defined
 * powertrain block this catalogue may describe; `P1`/`P3xxx` below P3400
 * are manufacturer territory and belong to nobody's generic catalogue.
 */
const GENERIC_POWERTRAIN_CODE = /^P0[0-3][0-9A-F]{2}$/

describe('SAE generic DTC catalogue', () => {
  it('describes a curated set of codes', () => {
    expect(SAE_GENERIC_DTC_ENTRIES.length).toBeGreaterThan(0)
  })

  it('returns the entry for a curated code', () => {
    const explanation = catalog.lookup(parseDtcCode('P0300'))

    expect(explanation.kind).toBe('catalog-entry')
    expect(
      explanation.kind === 'catalog-entry' && explanation.entry.code
    ).toBe('P0300')
  })

  /**
   * The honest fallback (RF-021, constraint 7). A code the catalogue does
   * not curate is still a real code — the answer is "no entry", never an
   * invented cause.
   */
  it.each([
    ['P0999', 'P'],
    ['P1234', 'P'],
    ['C0035', 'C'],
    ['B1318', 'B'],
    ['U0100', 'U']
  ])('falls back explicitly for the uncurated code %s', (code, system) => {
    expect(
      catalog.lookup(parseDtcCode(code))
    ).toEqual({
      kind: 'no-entry',
      code,
      system
    })
  })

  it('curates only SAE-generic powertrain codes', () => {
    for (const entry of SAE_GENERIC_DTC_ENTRIES) {
      expect(entry.code).toMatch(GENERIC_POWERTRAIN_CODE)
      expect(parseDtcCode(entry.code).type).toBe('generic')
    }
  })

  it('never lists the same code twice', () => {
    const codes = SAE_GENERIC_DTC_ENTRIES.map(entry => entry.code)

    expect(new Set(codes).size).toBe(codes.length)
  })

  it('gives every curated code real, non-empty guidance', () => {
    for (const entry of SAE_GENERIC_DTC_ENTRIES) {
      expect(entry.title.trim().length).toBeGreaterThan(0)
      expect(entry.immediateAction.trim().length).toBeGreaterThan(0)
      expect(entry.possibleCauses.length).toBeGreaterThan(0)
      expect(entry.recommendedChecks.length).toBeGreaterThan(0)
      expect(entry.subsystems.length).toBeGreaterThan(0)

      for (const text of [
        ...entry.possibleCauses,
        ...entry.recommendedChecks
      ]) {
        expect(text.trim().length).toBeGreaterThan(0)
      }
    }
  })

  /**
   * `AGENTS.MD`: generic OBD code must not carry Kia-specific logic. This
   * catalogue is the SAE half of the split, so no vehicle brand may appear
   * in it — not in a code, not in a cause, not in a piece of prose.
   */
  it('contains no vehicle-specific data', () => {
    const haystack = JSON.stringify(
      SAE_GENERIC_DTC_ENTRIES
    ).toLowerCase()

    for (const brand of ['kia', 'rio', 'hyundai', 'g4la', 'yb']) {
      expect(haystack).not.toContain(brand)
    }
  })

  it('leaves the RF-027 manual seam unpopulated', () => {
    for (const entry of SAE_GENERIC_DTC_ENTRIES) {
      expect(entry.manualReferences).toBeUndefined()
    }
  })

  /**
   * Constraint 2: a critical code must tell the driver to stop. The exact
   * wording is the catalogue's, but the instruction has to be there.
   */
  it('tells the driver to stop for every critical code', () => {
    const criticals = SAE_GENERIC_DTC_ENTRIES.filter(
      entry => entry.severity === 'critical'
    )

    expect(criticals.length).toBeGreaterThan(0)

    for (const entry of criticals) {
      expect(entry.immediateAction.toLowerCase()).toMatch(
        /det[eé]n|deja de conducir|no sigas conduciendo/
      )
    }
  })

  it('never claims a cause as confirmed', () => {
    for (const entry of SAE_GENERIC_DTC_ENTRIES) {
      for (const cause of entry.possibleCauses) {
        expect(cause.toLowerCase()).not.toMatch(
          /confirmad|seguro que|con certeza/
        )
      }
    }
  })
})
