// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SpeechCapabilityPanel from '../../app/components/SpeechCapabilityPanel.vue'
import type {
  SpeechCapabilityReport
} from '../../core/speech/detectSpeechCapability'

const stubs = {
  UCard: { template: '<div><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UAlert: {
    props: ['title', 'description'],
    template: '<div>{{ title }} {{ description }}<slot /></div>'
  },
  UButton: {
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }
}

function report(
  overrides: Partial<SpeechCapabilityReport> = {}
): SpeechCapabilityReport {
  return {
    synthesis: 'absent',
    recognition: 'absent',
    recognitionVendor: null,
    voiceCount: 0,
    spanishVoiceCount: 0,
    provesItWorks: false,
    notes: [],
    ...overrides
  }
}

function render(value: SpeechCapabilityReport | null) {
  return mount(SpeechCapabilityPanel, {
    props: { report: value },
    global: { stubs }
  })
}

describe('SpeechCapabilityPanel', () => {
  it('waits instead of claiming anything before the probe has run', () => {
    const text = render(null).text()

    expect(text).toContain('Sin comprobar')
    expect(text).not.toContain('ausente')
  })

  describe('the two engines', () => {
    it('reports synthesis as absent', () => {
      expect(render(report()).text()).toContain('Síntesis (TTS): ausente')
    })

    it('reports recognition as absent', () => {
      expect(render(report()).text())
        .toContain('Reconocimiento (STT): ausente')
    })

    it('names each support level in Spanish', () => {
      expect(render(report({ synthesis: 'available' })).text())
        .toContain('Síntesis (TTS): disponible')

      expect(render(report({ synthesis: 'reachable-but-unusable' })).text())
        .toContain('Síntesis (TTS): alcanzable, no utilizable')

      expect(render(report({
        recognition: 'reachable',
        recognitionVendor: 'webkit'
      })).text()).toContain('Reconocimiento (STT): alcanzable')
    })

    it('names the recognition vendor when there is one', () => {
      expect(render(report({
        recognition: 'reachable',
        recognitionVendor: 'webkit'
      })).text()).toContain('webkit')
    })
  })

  it('shows the voice counts', () => {
    const text = render(report({
      synthesis: 'available',
      voiceCount: 7,
      spanishVoiceCount: 2
    })).text()

    expect(text).toContain('7')
    expect(text).toContain('2')
  })

  it('shows every note the probe produced', () => {
    const text = render(report({
      notes: [
        'speechSynthesis no existe en este WebView: el TTS necesitará un puente nativo de Capacitor.',
        'No hay constructor de SpeechRecognition: el STT necesitará un puente nativo de Capacitor.'
      ]
    })).text()

    expect(text).toContain('speechSynthesis no existe en este WebView')
    expect(text).toContain('No hay constructor de SpeechRecognition')
  })

  /**
   * `provesItWorks` is always false and the panel must say so on screen, not
   * only in the type. A green "disponible" read as proof is exactly the
   * mistake ADR-012 was written to prevent.
   */
  it('always says the probe proves nothing', () => {
    for (const value of [
      report(),
      report({ synthesis: 'available', recognition: 'reachable' })
    ]) {
      expect(render(value).text()).toContain('no prueba que funcione')
    }
  })

  it('asks for a re-probe, because voices load asynchronously', async () => {
    const wrapper = render(report())

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })
})
