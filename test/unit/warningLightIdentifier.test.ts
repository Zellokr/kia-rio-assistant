// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import {
  describe,
  expect,
  it
} from 'vitest'

import WarningLightIdentifier from '../../app/components/WarningLightIdentifier.vue'
import WarningLightQuestionStep from '../../app/components/WarningLightQuestionStep.vue'
import WarningLightResultCard from '../../app/components/WarningLightResultCard.vue'
import { kiaRioWarningLightsCatalog } from '../../catalog/kia-rio/warning-lights'
import type {
  WarningLightCatalog,
  WarningLightEntry
} from '../../core/obd/diagnostics/ports'
import { parseDtcCode } from '../../core/obd/dtc/DtcCode'
import type { DtcObservation } from '../../core/obd/dtc/DtcCode'

/**
 * Nuxt UI components are auto-imported by Nuxt and unresolved here. The
 * stubs render their slots, so every assertion below reads text the
 * template actually produced rather than a string that merely appears in
 * the source file.
 */
const stubs = {
  UCard: { template: '<div><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UButton: {
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  },
  UAlert: {
    props: ['title', 'description'],
    template:
      '<div><p>{{ title }}</p><p>{{ description }}</p><slot /></div>'
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

const OIL_PRESSURE: WarningLightEntry = {
  id: 'oil-pressure',
  name: 'Presión de aceite del motor',
  color: 'red',
  shape: 'oil-can',
  behavior: ['steady'],
  displayTextKeywords: [],
  symptoms: [],
  severity: 'critical',
  immediateAction: 'Detén el vehículo y apaga el motor de inmediato.',
  recommendedChecks: ['Comprobar el nivel de aceite'],
  associatedDtcCodes: ['P0522'],
  associatedDtcPrefixes: [],
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
  all: () => [CHECK_ENGINE, OIL_PRESSURE, LOW_FUEL],
  byId: id => catalog.all().find(entry => entry.id === id)
}

function observation(code: string): DtcObservation {
  return {
    ...parseDtcCode(code),
    state: 'stored',
    observedAt: '2026-08-26T18:00:00.000Z'
  }
}

describe('WarningLightResultCard', () => {
  function render(identification: unknown) {
    return mount(WarningLightResultCard, {
      props: { identification },
      global: { stubs }
    })
  }

  it('renders a match with its severity, action and checks', () => {
    const text = render({
      kind: 'match',
      light: OIL_PRESSURE,
      answers: { color: 'red' },
      confidence: 'medium',
      limitations: []
    }).text()

    expect(text).toContain('Presión de aceite del motor')
    expect(text).toContain(
      'Detén el vehículo y apaga el motor de inmediato.'
    )
    expect(text).toContain('Comprobar el nivel de aceite')
  })

  it('renders every limitation a match carries', () => {
    const text = render({
      kind: 'match',
      light: CHECK_ENGINE,
      answers: {},
      confidence: 'low',
      limitations: [
        'No se ha confirmado la causa mediante OBD-II',
        'La identificación se basa en una descripción incompleta del testigo'
      ]
    }).text()

    expect(text).toContain('No se ha confirmado la causa mediante OBD-II')
    expect(text).toContain('descripción incompleta')
  })

  it('lists the remaining candidates by name', () => {
    const text = render({
      kind: 'candidates',
      candidates: [CHECK_ENGINE, LOW_FUEL],
      nextQuestion: 'shape',
      answers: { color: 'amber' }
    }).text()

    expect(text).toContain('Testigo de avería del motor')
    expect(text).toContain('Nivel de combustible bajo')
  })

  /**
   * The branch a UI is most tempted to skip. Every field of the safe
   * alternative has to reach the DOM, because it is all the driver gets.
   */
  it('renders the whole safe alternative when unidentified', () => {
    const text = render({
      kind: 'unidentified',
      answers: {},
      safeAlternative: {
        severityFloor: 'critical',
        immediateAction: 'Detén el vehículo en un lugar seguro.',
        recommendedChecks: [
          'Consultar el manual del vehículo',
          'Comprobar niveles con el motor frío'
        ],
        limitations: ['No se ha podido identificar el testigo']
      }
    }).text()

    expect(text).toContain('Detén el vehículo en un lugar seguro.')
    expect(text).toContain('Consultar el manual del vehículo')
    expect(text).toContain('Comprobar niveles con el motor frío')
    expect(text).toContain('No se ha podido identificar el testigo')
  })

  it('never shows a light name when nothing was identified', () => {
    const text = render({
      kind: 'unidentified',
      answers: {},
      safeAlternative: {
        severityFloor: 'warning',
        immediateAction: 'Conduce con precaución.',
        recommendedChecks: ['Consultar el manual del vehículo'],
        limitations: ['No se ha podido identificar el testigo']
      }
    }).text()

    for (const entry of catalog.all()) {
      expect(text).not.toContain(entry.name)
    }
  })

  /**
   * The exhaustive switch is not decoration. If the union ever gains a
   * fourth member, this must fail loudly instead of rendering an empty
   * card at a driver who is looking at a warning light.
   */
  it('refuses to render an outcome it does not know', () => {
    expect(() =>
      render({ kind: 'something-new', answers: {} })
    ).toThrow()
  })
})

describe('WarningLightQuestionStep', () => {
  function render(props: Record<string, unknown>) {
    return mount(WarningLightQuestionStep, {
      props,
      global: { stubs }
    })
  }

  it('asks the question and offers each option', () => {
    const wrapper = render({
      question: 'color',
      options: [
        { value: 'red', label: 'Rojo' },
        { value: 'amber', label: 'Ámbar' }
      ]
    })

    expect(wrapper.text()).toContain('color')
    expect(wrapper.text()).toContain('Rojo')
    expect(wrapper.text()).toContain('Ámbar')
  })

  it('emits the value behind the label the driver pressed', async () => {
    const wrapper = render({
      question: 'color',
      options: [
        { value: 'red', label: 'Rojo' },
        { value: 'amber', label: 'Ámbar' }
      ]
    })

    await wrapper.findAll('button')[1]!.trigger('click')

    expect(wrapper.emitted('answer')).toEqual([['amber']])
  })

  /**
   * "No identificado" is always available, at every step. A flow that only
   * offers it at the end forces a guess out of a driver who does not have
   * one.
   */
  it('always offers the opt-out', async () => {
    const wrapper = render({
      question: 'color',
      options: [{ value: 'red', label: 'Rojo' }]
    })

    const optOut = wrapper
      .findAll('button')
      .find(button => button.text().toLowerCase().includes('no identificado'))

    expect(optOut).toBeDefined()

    await optOut!.trigger('click')

    expect(wrapper.emitted('optOut')).toHaveLength(1)
  })

  it('accepts free text when the question has no fixed options', async () => {
    const wrapper = render({ question: 'displayText', options: [] })
    const input = wrapper.find('input')

    expect(input.exists()).toBe(true)

    await input.setValue('CHECK')
    await wrapper
      .findAll('button')
      .find(button => !button.text().toLowerCase().includes('no identificado'))!
      .trigger('click')

    expect(wrapper.emitted('answer')).toEqual([['CHECK']])
  })
})

describe('WarningLightIdentifier', () => {
  function render(props: Record<string, unknown> = {}) {
    return mount(WarningLightIdentifier, {
      props: { catalog, adapterConnected: true, ...props },
      global: { stubs }
    })
  }

  async function press(
    wrapper: ReturnType<typeof render>,
    label: string
  ) {
    const button = wrapper
      .findAll('button')
      .find(candidate => candidate.text() === label)

    expect(button, `no button labelled "${label}"`).toBeDefined()

    await button!.trigger('click')
  }

  /** RF-024 entry path (a): guided, from the light itself, no camera. */
  it('reaches a match by walking the guided questions', async () => {
    const wrapper = render()

    await press(wrapper, 'Rojo')

    expect(wrapper.text()).toContain('Presión de aceite del motor')
    expect(wrapper.text()).toContain(
      'Detén el vehículo y apaga el motor de inmediato.'
    )
  })

  it('shows the safe alternative the moment the driver opts out', async () => {
    const wrapper = render()

    const optOut = wrapper
      .findAll('button')
      .find(button => button.text().toLowerCase().includes('no identificado'))

    await optOut!.trigger('click')

    expect(wrapper.text().toLowerCase()).toContain('no se ha podido identificar')
  })

  it('leaves the ambiguous amber lozenge or hook unidentified rather than guessing GPF or immobilizer', async () => {
    const wrapper = mount(WarningLightIdentifier, {
      props: {
        catalog: kiaRioWarningLightsCatalog,
        adapterConnected: true
      },
      global: { stubs }
    })

    await press(wrapper, 'Ámbar')
    await press(wrapper, 'No identificado')

    expect(wrapper.text().toLowerCase()).toContain('no se ha podido identificar')
    expect(wrapper.text()).not.toContain('Filtro de partículas de gasolina')
    expect(wrapper.text()).not.toContain('Inmovilizador')
  })

  /** RF-024 entry path (b): from a DTC already read this session. */
  it('offers only lights the catalogue links to the read DTC', async () => {
    const wrapper = render({ dtcObservation: observation('P0522') })
    const text = wrapper.text()

    expect(text).toContain('Presión de aceite del motor')
    expect(text).toContain('Testigo de avería del motor')
    expect(text).not.toContain('Nivel de combustible bajo')
  })

  it('offers nothing rather than a guess when no light is linked', () => {
    const wrapper = render({ dtcObservation: observation('U0100') })

    expect(wrapper.text().toLowerCase()).toContain('no se ha podido identificar')
    expect(wrapper.text()).not.toContain('Nivel de combustible bajo')
  })

  describe('with no adapter connected', () => {
    it('says the cause is unconfirmed', async () => {
      const wrapper = render({ adapterConnected: false })

      await press(wrapper, 'Rojo')

      expect(wrapper.text()).toContain(
        'No se ha confirmado la causa mediante OBD-II'
      )
    })

    /**
     * Capping confidence withholds certainty, never guidance. The driver
     * still sees what the light means and what to do about it.
     */
    it('still shows the severity and the conservative action', async () => {
      const wrapper = render({ adapterConnected: false })

      await press(wrapper, 'Rojo')

      expect(wrapper.text()).toContain(
        'Detén el vehículo y apaga el motor de inmediato.'
      )
      expect(wrapper.text()).toContain('Comprobar el nivel de aceite')
    })
  })
})
