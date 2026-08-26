import {
  describe,
  expect,
  it
} from 'vitest'

import {
  assessDiagnostics
} from '../../core/obd/diagnostics/assessDiagnostics'
import type {
  DtcCatalog,
  DtcCatalogEntry
} from '../../core/obd/diagnostics/ports'
import { parseDtcCode } from '../../core/obd/dtc/DtcCode'
import type { DtcReadOutcome } from '../../core/obd/usecases/readDiagnosticCodes'

/** Spec §10.5 wording. Asserted verbatim — it is user-facing copy. */
const UNCONFIRMED_CAUSE_LIMITATION
  = 'No se ha confirmado la causa mediante OBD-II'

const CRITICAL_ENTRY: DtcCatalogEntry = {
  code: 'P0300',
  title: 'Fallo de encendido detectado en varios cilindros',
  severity: 'critical',
  possibleCauses: [
    'Bujías desgastadas',
    'Bobina de encendido defectuosa'
  ],
  recommendedChecks: [
    'Revisar el estado de las bujías'
  ],
  immediateAction:
    'Detén el vehículo en un lugar seguro, apaga el motor y no sigas '
    + 'conduciendo hasta que un taller revise el fallo.',
  subsystems: ['engine']
}

const WARNING_ENTRY: DtcCatalogEntry = {
  code: 'P0420',
  title: 'Rendimiento del catalizador por debajo del umbral',
  severity: 'warning',
  possibleCauses: [
    'Catalizador degradado'
  ],
  recommendedChecks: [
    'Comprobar la sonda lambda posterior'
  ],
  immediateAction:
    'Puedes seguir conduciendo con precaución, pero revisa el fallo lo '
    + 'antes posible.',
  subsystems: ['emissions']
}

const INFO_ENTRY: DtcCatalogEntry = {
  code: 'P0455',
  title: 'Fuga grande detectada en el sistema EVAP',
  severity: 'info',
  possibleCauses: [
    'Tapón del depósito mal cerrado'
  ],
  recommendedChecks: [
    'Comprobar el tapón del depósito'
  ],
  immediateAction:
    'No requiere acción inmediata. Revisa el fallo en el próximo '
    + 'mantenimiento.',
  subsystems: ['emissions']
}

const ENTRIES = new Map<string, DtcCatalogEntry>([
  [CRITICAL_ENTRY.code, CRITICAL_ENTRY],
  [WARNING_ENTRY.code, WARNING_ENTRY],
  [INFO_ENTRY.code, INFO_ENTRY]
])

const catalog: DtcCatalog = {
  lookup: (code) => {
    const entry = ENTRIES.get(code.code)

    return entry
      ? { kind: 'catalog-entry', entry }
      : {
          kind: 'no-entry',
          code: code.code,
          system: code.system
        }
  }
}

function codesRead(
  codes: readonly string[],
  options: {
    state?: 'stored' | 'pending' | 'permanent'
    complete?: boolean
  } = {}
): DtcReadOutcome {
  const complete = options.complete ?? true

  return {
    kind: 'codes',
    state: options.state ?? 'stored',
    codes: codes.map(parseDtcCode),
    complete,
    ...(complete
      ? {}
      : { incompleteReason: 'unvalidated-multi-frame' as const })
  }
}

describe('assessDiagnostics', () => {
  it('returns exactly the six mandatory spec §8.2 fields', () => {
    const assessment = assessDiagnostics(
      {
        reads: [codesRead(['P0420'])],
        adapterConnected: true
      },
      catalog
    )

    expect(Object.keys(assessment).sort()).toEqual([
      'confidence',
      'evidence',
      'immediateAction',
      'limitations',
      'possibleCauses',
      'severity'
    ])
    expect(assessment.immediateAction.length).toBeGreaterThan(0)
  })

  describe('severity', () => {
    it('takes the maximum over every contributing code', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0455', 'P0420', 'P0300'])],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.severity).toBe('critical')
    })

    it('does not escalate beyond the worst contributing code', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0455', 'P0420'])],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.severity).toBe('warning')
    })

    /**
     * A code the catalogue does not cover is still a fault the ECU stored.
     * Reporting it as `info` would tell the driver it is unimportant, which
     * is a claim the absence of an entry cannot support.
     */
    it('floors an uncovered code at warning, never info', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0143'])],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.severity).toBe('warning')
    })

    it('reports info when the vehicle confirmed no codes at all', () => {
      const assessment = assessDiagnostics(
        {
          reads: [{ kind: 'no-codes-reported', state: 'stored' }],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.severity).toBe('info')
    })
  })

  describe('confidence', () => {
    it('reaches high with two corroborating sources and complete reads', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0300'])],
          adapterConnected: true,
          driverReportedSymptoms: ['El motor tiembla al ralentí']
        },
        catalog
      )

      expect(assessment.confidence).toBe('high')
    })

    it('stays medium with a single complete catalogued read', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0300'])],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.confidence).toBe('medium')
    })

    it.each([
      [
        'an unconfirmed read',
        {
          reads: [
            codesRead(['P0300']),
            {
              kind: 'unconfirmed',
              state: 'pending',
              reason: 'no-data'
            } as DtcReadOutcome
          ],
          adapterConnected: true,
          driverReportedSymptoms: ['El motor tiembla al ralentí']
        }
      ],
      [
        'an incomplete decode',
        {
          reads: [codesRead(['P0300'], { complete: false })],
          adapterConnected: true,
          driverReportedSymptoms: ['El motor tiembla al ralentí']
        }
      ],
      [
        'a no-entry fallback',
        {
          reads: [codesRead(['P0300', 'P0143'])],
          adapterConnected: true,
          driverReportedSymptoms: ['El motor tiembla al ralentí']
        }
      ],
      [
        'a disconnected adapter',
        {
          reads: [codesRead(['P0300'])],
          adapterConnected: false,
          driverReportedSymptoms: ['El motor tiembla al ralentí']
        }
      ]
    ])('caps at low on %s', (_label, context) => {
      const assessment = assessDiagnostics(context, catalog)

      expect(assessment.confidence).toBe('low')
    })
  })

  describe('evidence', () => {
    /** Spec §10.4 ordering: OBD data, then local rules, then driver input. */
    it('orders sources per §10.4 and never invents a manual source', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0300'])],
          adapterConnected: true,
          driverReportedSymptoms: ['El motor tiembla al ralentí']
        },
        catalog
      )

      expect(
        assessment.evidence.map(item => item.source)
      ).toEqual([
        'obd-data',
        'local-rules',
        'driver-input'
      ])
      expect(
        assessment.evidence.some(item => item.source === 'manual')
      ).toBe(false)
    })

    it('records an unconfirmed read as evidence rather than dropping it', () => {
      const assessment = assessDiagnostics(
        {
          reads: [
            {
              kind: 'unconfirmed',
              state: 'permanent',
              reason: 'unsupported-mode'
            }
          ],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.evidence).toHaveLength(1)
      expect(assessment.evidence[0]).toMatchObject({
        source: 'obd-data'
      })
    })
  })

  describe('possibleCauses', () => {
    it('collects catalogued causes without inventing any', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0420'])],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.possibleCauses).toEqual([
        'Catalizador degradado'
      ])
    })

    it('stays empty when no contributing code has an entry', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0143'])],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.possibleCauses).toEqual([])
    })
  })

  describe('critical severity', () => {
    it('always carries a conservative immediate action', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0300'])],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.severity).toBe('critical')
      expect(assessment.immediateAction).toBe(
        CRITICAL_ENTRY.immediateAction
      )
    })

    /**
     * A critical severity can be reached from an uncovered code, where the
     * catalogue supplies no action at all. The conservative action is still
     * mandatory — the driver must never be left without one.
     */
    it('supplies a conservative action even with no catalogue entry', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0143'])],
          adapterConnected: false
        },
        catalog
      )

      expect(assessment.immediateAction.length).toBeGreaterThan(0)
      expect(assessment.possibleCauses).toEqual([])
    })

    it('states that the cause is unconfirmed when no complete read backs it', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0300'], { complete: false })],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.severity).toBe('critical')
      expect(assessment.limitations).toContain(
        UNCONFIRMED_CAUSE_LIMITATION
      )
    })

    it('omits the unconfirmed-cause limitation when a complete read backs it', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0300'])],
          adapterConnected: true
        },
        catalog
      )

      expect(assessment.limitations).not.toContain(
        UNCONFIRMED_CAUSE_LIMITATION
      )
    })
  })

  describe('limitations', () => {
    it('reports a disconnected adapter and an unconfirmed cause', () => {
      const assessment = assessDiagnostics(
        {
          reads: [],
          adapterConnected: false
        },
        catalog
      )

      expect(assessment.limitations).toContain(
        UNCONFIRMED_CAUSE_LIMITATION
      )
      expect(
        assessment.limitations.some(limitation =>
          limitation.includes('adaptador')
        )
      ).toBe(true)
    })

    it('names the code the catalogue does not cover', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0143'])],
          adapterConnected: true
        },
        catalog
      )

      expect(
        assessment.limitations.some(limitation =>
          limitation.includes('P0143')
        )
      ).toBe(true)
    })

    it('reports an incomplete read without claiming what was missed', () => {
      const assessment = assessDiagnostics(
        {
          reads: [codesRead(['P0420'], { complete: false })],
          adapterConnected: true
        },
        catalog
      )

      expect(
        assessment.limitations.some(limitation =>
          limitation.includes('incompleta')
        )
      ).toBe(true)
    })

    it('reports an unconfirmed read as unconfirmed, never as an absence', () => {
      const assessment = assessDiagnostics(
        {
          reads: [
            {
              kind: 'unconfirmed',
              state: 'pending',
              reason: 'no-data'
            }
          ],
          adapterConnected: true
        },
        catalog
      )

      const joined = assessment.limitations.join(' ')

      expect(joined).toContain('sin confirmar')
      expect(joined).not.toContain('sin pendientes')
    })
  })
})
