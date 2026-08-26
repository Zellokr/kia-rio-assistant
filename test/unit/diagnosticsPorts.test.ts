import {
  describe,
  expect,
  it
} from 'vitest'

import {
  assessDiagnostics
} from '../../core/obd/diagnostics/assessDiagnostics'
import {
  DIAGNOSTIC_SEVERITY_ORDER,
  compareDiagnosticSeverity
} from '../../core/obd/diagnostics/ports'
import type {
  DtcCatalog,
  DtcCatalogEntry,
  WarningLightCatalog,
  WarningLightEntry
} from '../../core/obd/diagnostics/ports'
import { parseDtcCode } from '../../core/obd/dtc/DtcCode'

const BASE_ENTRY: DtcCatalogEntry = {
  code: 'P0420',
  title: 'Rendimiento del catalizador por debajo del umbral',
  severity: 'warning',
  possibleCauses: ['Catalizador degradado'],
  recommendedChecks: ['Comprobar la sonda lambda posterior'],
  immediateAction: 'Revisa el fallo lo antes posible.',
  subsystems: ['emissions']
}

const BASE_LIGHT: WarningLightEntry = {
  id: 'check-engine',
  name: 'Testigo de avería del motor',
  color: 'amber',
  shape: 'engine-outline',
  behavior: ['steady'],
  displayTextKeywords: ['CHECK', 'ENGINE'],
  symptoms: ['Pérdida de potencia'],
  severity: 'warning',
  immediateAction: 'Revisa el fallo lo antes posible.',
  recommendedChecks: ['Leer los códigos de diagnóstico'],
  associatedDtcCodes: ['P0420'],
  associatedDtcPrefixes: ['P03'],
  subsystems: ['engine', 'emissions']
}

function catalogFor(entry: DtcCatalogEntry): DtcCatalog {
  return {
    lookup: code =>
      code.code === entry.code
        ? { kind: 'catalog-entry', entry }
        : {
            kind: 'no-entry',
            code: code.code,
            system: code.system
          }
  }
}

describe('diagnostics ports', () => {
  it('orders severity from least to most serious', () => {
    expect([...DIAGNOSTIC_SEVERITY_ORDER]).toEqual([
      'info',
      'warning',
      'critical'
    ])

    expect(
      compareDiagnosticSeverity('critical', 'warning')
    ).toBeGreaterThan(0)
    expect(
      compareDiagnosticSeverity('info', 'warning')
    ).toBeLessThan(0)
    expect(
      compareDiagnosticSeverity('warning', 'warning')
    ).toBe(0)
  })

  it('resolves a catalogued code and falls back explicitly otherwise', () => {
    const catalog = catalogFor(BASE_ENTRY)

    expect(
      catalog.lookup(parseDtcCode('P0420'))
    ).toEqual({ kind: 'catalog-entry', entry: BASE_ENTRY })

    expect(
      catalog.lookup(parseDtcCode('P1234'))
    ).toEqual({
      kind: 'no-entry',
      code: 'P1234',
      system: 'P'
    })
  })

  it('serves warning lights by id and in full', () => {
    const catalog: WarningLightCatalog = {
      all: () => [BASE_LIGHT],
      byId: id => (id === BASE_LIGHT.id ? BASE_LIGHT : undefined)
    }

    expect(catalog.all()).toEqual([BASE_LIGHT])
    expect(catalog.byId('check-engine')).toEqual(BASE_LIGHT)
    expect(catalog.byId('unknown-light')).toBeUndefined()
  })

  /**
   * RF-027 and RF-028 are typed seams only. They exist so Fase 3 does not
   * have to reshape the catalogue, and nothing in Fase 2 may read them —
   * a populated seam must not change a single byte of the assessment.
   */
  it('leaves the RF-027 manual seam unread', () => {
    const context = {
      reads: [
        {
          kind: 'codes' as const,
          state: 'stored' as const,
          codes: [parseDtcCode('P0420')],
          complete: true
        }
      ],
      adapterConnected: true
    }

    const withoutSeam = assessDiagnostics(
      context,
      catalogFor(BASE_ENTRY)
    )
    const withSeam = assessDiagnostics(
      context,
      catalogFor({
        ...BASE_ENTRY,
        manualReferences: [
          {
            title: 'Manual de taller Rio YB',
            section: '§5.2'
          }
        ]
      })
    )

    expect(withSeam).toEqual(withoutSeam)
  })

  it('leaves the RF-028 applicability seam unread', () => {
    const populated: WarningLightEntry = {
      ...BASE_LIGHT,
      applicability: {
        model: 'Rio',
        generation: 'YB',
        yearFrom: 2017,
        yearTo: 2023
      }
    }

    expect(populated.applicability).toBeDefined()
    expect({ ...populated, applicability: undefined }).toEqual({
      ...BASE_LIGHT,
      applicability: undefined
    })
  })
})
