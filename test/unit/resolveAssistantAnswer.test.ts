import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildAssistantRequest } from '../../core/assistant/buildAssistantRequest'
import type {
  AssistantRequest
} from '../../core/assistant/buildAssistantRequest'
import { composeLocalAnswer } from '../../core/assistant/composeLocalAnswer'
import {
  resolveAssistantAnswer
} from '../../core/assistant/resolveAssistantAnswer'
import type {
  DiagnosticAssessment
} from '../../core/obd/diagnostics/assessDiagnostics'

const NOW_MS = Date.parse('2026-08-29T10:00:00.000Z')

const ASSESSMENT: DiagnosticAssessment = {
  severity: 'warning',
  confidence: 'medium',
  dtcs: ['P0128'],
  evidence: [],
  possibleCauses: ['Termostato bloqueado abierto'],
  immediateAction:
    'Puedes seguir conduciendo con precaución, pero lleva el vehículo a '
    + 'un taller para que revise el fallo lo antes posible.',
  recommendedChecks: ['Comprobar el termostato'],
  limitations: []
}

function request(
  assessment: DiagnosticAssessment | null = ASSESSMENT
): AssistantRequest {
  const built = buildAssistantRequest({
    query: { text: '¿qué le pasa al coche?', intent: null },
    assessment,
    nowMs: NOW_MS
  })

  if (!built) {
    throw new Error('the fixture query must build a request')
  }

  return built
}

afterEach(() => {
  vi.useRealTimers()
})

describe('resolveAssistantAnswer', () => {
  it('returns the AI answer when it validates', async () => {
    const answer = await resolveAssistantAnswer({
      request: request(),
      ask: async () => 'El código P0128 apunta al termostato.'
    })

    expect(answer).toEqual({
      text: 'El código P0128 apunta al termostato.',
      source: 'ai',
      reasons: []
    })
  })

  /**
   * RF-033: the template is a fallback, "únicamente como fallback temporal".
   * Every branch below is a way the outside world failed, and none of them
   * is allowed to leave the driver without an answer.
   */
  describe('un error externo no impide responder', () => {
    it('answers from the template when the provider throws', async () => {
      const answer = await resolveAssistantAnswer({
        request: request(),
        ask: async () => {
          throw new Error('502 Bad Gateway')
        }
      })

      expect(answer.source).toBe('local-template')
      expect(answer.text).toBe(composeLocalAnswer(ASSESSMENT))
      expect(answer.reasons).toEqual([
        { kind: 'provider-failed', message: '502 Bad Gateway' }
      ])
    })

    it('answers when the provider rejects with something that is not an Error', async () => {
      const answer = await resolveAssistantAnswer({
        request: request(),
        ask: async () => await Promise.reject('caída de red')
      })

      expect(answer.source).toBe('local-template')
      expect(answer.reasons).toEqual([
        { kind: 'provider-failed', message: 'caída de red' }
      ])
    })

    it('answers when the provider never settles', async () => {
      vi.useFakeTimers()

      const pending = resolveAssistantAnswer({
        request: request(),
        ask: async () => await new Promise<string>(() => {}),
        timeoutMs: 8000
      })

      await vi.advanceTimersByTimeAsync(8000)

      const answer = await pending

      expect(answer.source).toBe('local-template')
      expect(answer.reasons).toEqual([{ kind: 'provider-timed-out' }])
    })

    /** §9.5's modo degradado: no Internet, so no provider is wired at all. */
    it('answers with no provider configured', async () => {
      const answer = await resolveAssistantAnswer({
        request: request()
      })

      expect(answer.source).toBe('local-template')
      expect(answer.text).toBe(composeLocalAnswer(ASSESSMENT))
      expect(answer.reasons).toEqual([{ kind: 'no-provider' }])
    })
  })

  describe('a validated fallback', () => {
    it('drops an answer that breaks a §9.4 rule and says which', async () => {
      const answer = await resolveAssistantAnswer({
        request: request(),
        ask: async () => 'Seguramente sea también un P0420.'
      })

      expect(answer.source).toBe('local-template')
      expect(answer.text).toBe(composeLocalAnswer(ASSESSMENT))
      expect(answer.reasons).toEqual([
        { kind: 'unknown-dtc', codes: ['P0420'] }
      ])
    })

    it('drops an empty answer', async () => {
      const answer = await resolveAssistantAnswer({
        request: request(),
        ask: async () => '   '
      })

      expect(answer.source).toBe('local-template')
      expect(answer.reasons).toEqual([{ kind: 'empty' }])
    })
  })

  /**
   * Nothing has been read from the vehicle, so there is no evaluation to
   * template from. Saying that beats composing a confident empty report.
   */
  it('says plainly when it has neither an AI nor an assessment', async () => {
    const answer = await resolveAssistantAnswer({
      request: request(null)
    })

    expect(answer.source).toBe('local-template')
    expect(answer.text).toContain('lectura')
    expect(answer.text.trim().length).toBeGreaterThan(0)
  })

  it('never returns an empty answer, whatever failed', async () => {
    const failures = [
      async () => {
        throw new Error('boom')
      },
      async () => '',
      async () => 'Un P9999 inventado.'
    ]

    for (const ask of failures) {
      const answer = await resolveAssistantAnswer({
        request: request(),
        ask
      })

      expect(answer.text.trim().length).toBeGreaterThan(0)
    }
  })
})
