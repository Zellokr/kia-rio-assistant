// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import {
  describe,
  expect,
  it
} from 'vitest'

import DiagnosticAssessmentCard from '../../app/components/DiagnosticAssessmentCard.vue'
import type {
  DiagnosticAssessment
} from '../../core/obd/diagnostics/assessDiagnostics'
import { parseDtcCode } from '../../core/obd/dtc/DtcCode'
import type {
  DtcReadOutcome
} from '../../core/obd/usecases/readDiagnosticCodes'

const stubs = {
  UCard: { template: '<div><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UButton: {
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }
}

const ASSESSMENT: DiagnosticAssessment = {
  severity: 'critical',
  confidence: 'medium',
  evidence: [
    {
      source: 'obd-data',
      summary: 'Lectura de códigos almacenados: 1 código(s)'
    },
    {
      source: 'local-rules',
      summary: 'P0300: Fallo de encendido detectado en varios cilindros'
    }
  ],
  possibleCauses: [
    'Bujías desgastadas',
    'Bobina de encendido defectuosa'
  ],
  immediateAction: 'Detén el vehículo en un lugar seguro.',
  limitations: ['No se ha confirmado la causa mediante OBD-II']
}

function storedRead(codes: readonly string[]): DtcReadOutcome {
  return {
    kind: 'codes',
    state: 'stored',
    codes: codes.map(parseDtcCode),
    complete: true
  }
}

function render(props: Record<string, unknown>) {
  return mount(DiagnosticAssessmentCard, {
    props,
    global: { stubs }
  })
}

describe('DiagnosticAssessmentCard', () => {
  it('renders all six mandatory spec §8.2 fields', () => {
    const text = render({
      assessment: ASSESSMENT,
      reads: [storedRead(['P0300'])]
    }).text()

    expect(text).toContain('Grave')
    expect(text).toContain('Confianza media')
    expect(text).toContain('Bujías desgastadas')
    expect(text).toContain('Bobina de encendido defectuosa')
    expect(text).toContain('Detén el vehículo en un lugar seguro.')
    expect(text).toContain('No se ha confirmado la causa mediante OBD-II')
    expect(text).toContain('Lectura de códigos almacenados')
  })

  it('lists the codes that were actually read', () => {
    const text = render({
      assessment: ASSESSMENT,
      reads: [storedRead(['P0300', 'P0420'])]
    }).text()

    expect(text).toContain('P0300')
    expect(text).toContain('P0420')
  })

  /**
   * Constraint 6, at the last place it can still be broken. A read the
   * vehicle never answered must not read as "no hay códigos".
   */
  it('shows an unconfirmed read as unconfirmed, never as an absence', () => {
    const text = render({
      assessment: {
        ...ASSESSMENT,
        severity: 'info',
        possibleCauses: [],
        limitations: [
          'Los códigos pendientes quedan sin confirmar; el vehículo no respondió a esa lectura'
        ]
      },
      reads: [
        { kind: 'unconfirmed', state: 'pending', reason: 'no-data' }
      ]
    }).text().toLowerCase()

    expect(text).toContain('sin confirmar')
    expect(text).not.toContain('sin códigos pendientes')
    expect(text).not.toContain('no hay códigos')
  })

  it('distinguishes a vehicle-confirmed zero from an unconfirmed read', () => {
    const text = render({
      assessment: { ...ASSESSMENT, severity: 'info', possibleCauses: [] },
      reads: [{ kind: 'no-codes-reported', state: 'stored' }]
    }).text().toLowerCase()

    expect(text).toContain('sin códigos')
    expect(text).not.toContain('sin confirmar')
  })

  it('flags an incomplete read instead of trusting it', () => {
    const text = render({
      assessment: ASSESSMENT,
      reads: [
        {
          kind: 'codes',
          state: 'stored',
          codes: [parseDtcCode('P0300')],
          complete: false,
          incompleteReason: 'unvalidated-multi-frame'
        }
      ]
    }).text().toLowerCase()

    expect(text).toContain('incompleta')
  })

  it('says a read failed rather than implying the car is healthy', () => {
    const text = render({
      assessment: { ...ASSESSMENT, severity: 'info', possibleCauses: [] },
      reads: [{ kind: 'failed', state: 'stored', reason: 'timeout' }]
    }).text().toLowerCase()

    expect(text).toContain('falló')
    expect(text).not.toContain('sin códigos')
  })

  it('renders an empty state before anything has been read', () => {
    const wrapper = render({ assessment: undefined, reads: [] })

    expect(wrapper.text().length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain('Grave')
  })
})
