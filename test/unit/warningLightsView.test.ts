// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import {
  describe,
  expect,
  it
} from 'vitest'

import WarningLightsView from '../../app/components/WarningLightsView.vue'
import type {
  WarningLightCatalog,
  WarningLightEntry
} from '../../core/obd/diagnostics/ports'
import { parseDtcCode } from '../../core/obd/dtc/DtcCode'
import type {
  DtcReadOutcome
} from '../../core/obd/usecases/readDiagnosticCodes'

const stubs = {
  UCard: { template: '<div><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UButton: {
    props: ['color', 'variant'],
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  },
  UAlert: {
    props: ['title', 'description'],
    template: '<div><p>{{ title }}</p><p>{{ description }}</p><slot /></div>'
  },
  UInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">'
  }
}

const CHECK_ENGINE: WarningLightEntry = {
  id: 'check-engine',
  name: 'Testigo de avería del motor',
  color: 'amber',
  shape: 'engine-outline',
  behavior: ['steady'],
  displayTextKeywords: ['CHECK'],
  symptoms: ['Pérdida de potencia'],
  severity: 'warning',
  immediateAction: 'Acude a un taller lo antes posible.',
  recommendedChecks: ['Leer los códigos de diagnóstico'],
  associatedDtcCodes: [],
  associatedDtcPrefixes: ['P0'],
  subsystems: ['engine']
}

const LOW_FUEL: WarningLightEntry = {
  id: 'low-fuel',
  name: 'Nivel de combustible bajo',
  color: 'amber',
  shape: 'fuel-pump',
  behavior: ['steady'],
  displayTextKeywords: [],
  symptoms: [],
  severity: 'info',
  immediateAction: 'Reposta en la próxima estación de servicio.',
  recommendedChecks: ['Comprobar la autonomía restante'],
  associatedDtcCodes: [],
  associatedDtcPrefixes: [],
  subsystems: ['fuel']
}

const catalog: WarningLightCatalog = {
  all: () => [CHECK_ENGINE, LOW_FUEL],
  byId: id => catalog.all().find(entry => entry.id === id)
}

function render(reads: readonly DtcReadOutcome[] = []) {
  return mount(WarningLightsView, {
    props: {
      catalog,
      adapterConnected: false,
      reads
    },
    global: { stubs }
  })
}

describe('WarningLightsView', () => {
  it('explains that the visual guide works before any OBD code is read', () => {
    const text = render().text()

    expect(text).toContain('Guía visual primero')
    expect(text).toContain('Puedes identificar un testigo sin conectar el adaptador')
    expect(text).toContain('Sin códigos leídos todavía')
    expect(text).toContain('ir a Averías para leer DTC')
  })

  it('shows session DTC evidence and declared warning-light matches', () => {
    const wrapper = render([
      {
        kind: 'codes',
        state: 'stored',
        codes: [parseDtcCode('P0300')],
        complete: true
      }
    ])
    const text = wrapper.text()

    expect(text).toContain('Evidencia OBD de esta sesión')
    expect(text).toContain('P0300 · almacenado')
    expect(text).toContain('Relación orientativa')
    expect(text).toContain('no demuestra causalidad')
    expect(text).toContain('Testigo de avería del motor')
    expect(text).not.toContain('Nivel de combustible bajo')
  })
})
