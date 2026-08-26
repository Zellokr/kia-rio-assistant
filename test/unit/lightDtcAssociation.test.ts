import {
  describe,
  expect,
  it
} from 'vitest'

import {
  associateLightWithDtc,
  associateLightsWithDtc
} from '../../core/obd/diagnostics/association'
import type {
  DtcCatalogEntry,
  WarningLightCatalog,
  WarningLightEntry
} from '../../core/obd/diagnostics/ports'
import { parseDtcCode } from '../../core/obd/dtc/DtcCode'
import type { DtcObservation } from '../../core/obd/dtc/DtcCode'

function observation(code: string): DtcObservation {
  return {
    ...parseDtcCode(code),
    state: 'stored',
    observedAt: '2026-08-26T18:00:00.000Z'
  }
}

function light(
  overrides: Partial<WarningLightEntry> = {}
): WarningLightEntry {
  return {
    id: 'check-engine',
    name: 'Testigo de avería del motor',
    color: 'amber',
    shape: 'engine-outline',
    behavior: ['steady'],
    displayTextKeywords: [],
    symptoms: [],
    severity: 'warning',
    immediateAction: 'Revisa el fallo lo antes posible.',
    recommendedChecks: ['Leer los códigos de diagnóstico'],
    associatedDtcCodes: [],
    associatedDtcPrefixes: [],
    subsystems: [],
    ...overrides
  }
}

function dtcEntry(
  overrides: Partial<DtcCatalogEntry> = {}
): DtcCatalogEntry {
  return {
    code: 'P0300',
    title: 'Fallo de encendido',
    severity: 'critical',
    possibleCauses: ['Bujías desgastadas'],
    recommendedChecks: ['Revisar las bujías'],
    immediateAction: 'Detén el vehículo.',
    subsystems: ['engine'],
    ...overrides
  }
}

describe('associateLightWithDtc', () => {
  it('associates on a catalogue-declared exact code', () => {
    const association = associateLightWithDtc(
      light({ associatedDtcCodes: ['P0300'] }),
      observation('P0300')
    )

    expect(association).toBeDefined()
    expect(association?.lightId).toBe('check-engine')
    expect(association?.observation.code).toBe('P0300')
    expect(association?.basis).toEqual({
      kind: 'catalog-dtc-code',
      code: 'P0300'
    })
  })

  it('associates on a catalogue-declared prefix', () => {
    const association = associateLightWithDtc(
      light({ associatedDtcPrefixes: ['P03'] }),
      observation('P0304')
    )

    expect(association?.basis).toEqual({
      kind: 'catalog-dtc-prefix',
      prefix: 'P03'
    })
  })

  /**
   * The third declared basis needs the DTC's own catalogue entry, because a
   * `DtcObservation` carries no subsystem of its own. Passing the
   * explanation keeps BOTH sides of the association catalogue-declared.
   */
  it('associates on a subsystem both catalogues declare', () => {
    const association = associateLightWithDtc(
      light({ subsystems: ['engine', 'emissions'] }),
      observation('P0420'),
      {
        kind: 'catalog-entry',
        entry: dtcEntry({ code: 'P0420', subsystems: ['emissions'] })
      }
    )

    expect(association?.basis).toEqual({
      kind: 'shared-subsystem',
      subsystem: 'emissions'
    })
  })

  it('prefers the most specific basis available', () => {
    const association = associateLightWithDtc(
      light({
        associatedDtcCodes: ['P0420'],
        associatedDtcPrefixes: ['P04'],
        subsystems: ['emissions']
      }),
      observation('P0420'),
      {
        kind: 'catalog-entry',
        entry: dtcEntry({ code: 'P0420', subsystems: ['emissions'] })
      }
    )

    expect(association?.basis.kind).toBe('catalog-dtc-code')
  })

  /**
   * RF-025, the whole point of this module. Two things whose names read
   * alike are not related, and the constructor has no text input at all —
   * so it cannot be talked into inventing a basis.
   */
  it('refuses a pair that only resembles each other by name', () => {
    const association = associateLightWithDtc(
      light({
        id: 'coolant-temperature',
        name: 'Temperatura del refrigerante',
        displayTextKeywords: ['TEMP', 'COOLANT'],
        symptoms: ['Temperatura alta del motor']
      }),
      observation('P0118'),
      {
        kind: 'catalog-entry',
        entry: dtcEntry({
          code: 'P0118',
          title: 'Sensor de temperatura del refrigerante: señal alta',
          subsystems: ['cooling']
        })
      }
    )

    expect(association).toBeUndefined()
  })

  it('refuses when the DTC has no catalogue entry to share a subsystem with', () => {
    const association = associateLightWithDtc(
      light({ subsystems: ['engine'] }),
      observation('P0143'),
      { kind: 'no-entry', code: 'P0143', system: 'P' }
    )

    expect(association).toBeUndefined()
  })

  it('refuses when no explanation is supplied and nothing else declares a link', () => {
    expect(
      associateLightWithDtc(
        light({ subsystems: ['engine'] }),
        observation('P0300')
      )
    ).toBeUndefined()
  })

  it('does not match a prefix that only partially overlaps the code', () => {
    expect(
      associateLightWithDtc(
        light({ associatedDtcPrefixes: ['P04'] }),
        observation('P0300')
      )
    ).toBeUndefined()
  })

  it('is case-insensitive about declared codes and prefixes', () => {
    expect(
      associateLightWithDtc(
        light({ associatedDtcCodes: ['p0300'] }),
        observation('P0300')
      )?.basis
    ).toEqual({ kind: 'catalog-dtc-code', code: 'P0300' })
  })
})

describe('associateLightsWithDtc', () => {
  const catalog: WarningLightCatalog = {
    all: () => [
      light({ id: 'check-engine', associatedDtcPrefixes: ['P0'] }),
      light({ id: 'oil-pressure', associatedDtcCodes: ['P0522'] }),
      light({ id: 'low-fuel' })
    ],
    byId: id => catalog.all().find(entry => entry.id === id)
  }

  it('offers only lights the catalogue declares compatible', () => {
    const associations = associateLightsWithDtc(
      catalog,
      observation('P0522')
    )

    expect(
      associations.map(item => item.lightId).sort()
    ).toEqual(['check-engine', 'oil-pressure'])
  })

  it('offers nothing when the catalogue declares no mapping', () => {
    expect(
      associateLightsWithDtc(catalog, observation('U0100'))
    ).toEqual([])
  })
})
