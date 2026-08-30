// @vitest-environment nuxt
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AssistantAnswerPanel from '../../app/components/AssistantAnswerPanel.vue'
import type {
  AssistantAnswer
} from '../../core/assistant/resolveAssistantAnswer'

const stubs = {
  UBadge: { template: '<span data-testid="assistant-answer-source"><slot /></span>' }
}

function mountPanel(props: {
  answer: AssistantAnswer | null
  pending?: boolean
}) {
  return mount(AssistantAnswerPanel, {
    props,
    global: { stubs }
  })
}

describe('AssistantAnswerPanel', () => {
  it('shows the pending state while an answer is being prepared', () => {
    const wrapper = mountPanel({ answer: null, pending: true })

    expect(wrapper.get('[data-testid="assistant-answer"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Preparando una respuesta local')
  })

  it('shows a local fallback answer when no provider is available', () => {
    const wrapper = mountPanel({
      answer: {
        text: 'Conecta el adaptador y lee los códigos para obtener una evaluación local.',
        source: 'local-template',
        reasons: [{ kind: 'no-provider' }]
      }
    })

    expect(wrapper.text()).toContain('Respuesta del asistente')
    expect(wrapper.text()).toContain('Fallback local')
    expect(wrapper.text()).toContain('Conecta el adaptador')
  })

  it('explains why the fallback was used', () => {
    const wrapper = mountPanel({
      answer: {
        text: 'Usa la evaluación local y revisa los códigos antes de seguir.',
        source: 'local-template',
        reasons: [
          { kind: 'provider-timed-out' },
          { kind: 'unknown-dtc', codes: ['P9999'] }
        ]
      }
    })

    expect(wrapper.get('[data-testid="assistant-answer-reasons"]').text())
      .toContain('el proveedor de IA no respondió a tiempo; DTC no enviado rechazado: P9999')
  })
})
