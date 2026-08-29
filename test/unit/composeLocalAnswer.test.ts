import { describe, expect, it } from 'vitest'

import { composeLocalAnswer } from '../../core/assistant/composeLocalAnswer'
import type {
  DiagnosticAssessment
} from '../../core/obd/diagnostics/assessDiagnostics'

function assessment(
  overrides: Partial<DiagnosticAssessment> = {}
): DiagnosticAssessment {
  return {
    severity: 'warning',
    confidence: 'medium',
    dtcs: ['P0128'],
    evidence: [
      {
        type: 'dtc',
        description: 'P0128: Termostato por debajo de la temperatura'
      }
    ],
    possibleCauses: ['Termostato bloqueado abierto'],
    immediateAction:
      'Puedes seguir conduciendo con precaución, pero lleva el vehículo a '
      + 'un taller.',
    recommendedChecks: ['Comprobar el termostato'],
    limitations: ['No se ha confirmado la causa mediante OBD-II'],
    ...overrides
  }
}

describe('composeLocalAnswer', () => {
  /**
   * §9's FORMATO DE RESPUESTA fixes the order: código o testigo detectado →
   * sistema relacionado → gravedad → evidencias → causas posibles → qué
   * hacer ahora → comprobación recomendada → limitación. The order is the
   * contract, so it is what this asserts.
   */
  it('follows the order §9 fixes', () => {
    const answer = composeLocalAnswer(assessment())

    const positions = [
      'Códigos detectados',
      'Gravedad',
      'Evidencias',
      'Causas posibles',
      'Qué hacer ahora',
      'Comprobación recomendada',
      'Limitaciones'
    ].map(heading => answer.indexOf(heading))

    expect(positions.every(position => position >= 0)).toBe(true)

    expect([...positions].sort((left, right) => left - right))
      .toEqual(positions)
  })

  it('carries the code, the action and the limitation verbatim', () => {
    const answer = composeLocalAnswer(assessment())

    expect(answer).toContain('P0128')
    expect(answer).toContain('lleva el vehículo a un taller.')
    expect(answer).toContain('No se ha confirmado la causa mediante OBD-II')
  })

  describe('gravedad', () => {
    it('uses §9.2 wording for each level', () => {
      expect(composeLocalAnswer(assessment({ severity: 'info' })))
        .toContain('Gravedad: Información')

      expect(composeLocalAnswer(assessment({ severity: 'warning' })))
        .toContain('Gravedad: Advertencia')

      expect(composeLocalAnswer(assessment({ severity: 'critical' })))
        .toContain('Gravedad: Crítica')
    })

    /**
     * The same hedge the spoken form uses. A low-confidence finding read as
     * a flat statement is the failure §10.5 exists to prevent.
     */
    it('hedges a low-confidence finding', () => {
      expect(composeLocalAnswer(assessment({ confidence: 'low' })))
        .toContain('Gravedad: Advertencia (sin confirmar)')
    })

    it('does not hedge a corroborated finding', () => {
      expect(composeLocalAnswer(assessment({ confidence: 'high' })))
        .not.toContain('sin confirmar')
    })
  })

  describe('empty sections', () => {
    it('says so when the vehicle reported no codes', () => {
      const answer = composeLocalAnswer(assessment({
        dtcs: [],
        possibleCauses: [],
        recommendedChecks: []
      }))

      expect(answer).toContain('Códigos detectados: ninguno')
    })

    /**
     * An empty heading invites the reader to supply the content themselves.
     * Nothing to say is said by not saying it.
     */
    it('omits a section with nothing in it', () => {
      const answer = composeLocalAnswer(assessment({
        possibleCauses: [],
        recommendedChecks: []
      }))

      expect(answer).not.toContain('Causas posibles')
      expect(answer).not.toContain('Comprobación recomendada')
    })

    it('always states the action, which the engine always produces', () => {
      const answer = composeLocalAnswer(assessment({
        dtcs: [],
        evidence: [],
        possibleCauses: [],
        recommendedChecks: [],
        limitations: []
      }))

      expect(answer).toContain('Qué hacer ahora:')
      expect(answer.trim().length).toBeGreaterThan(0)
    })
  })

  it('lists every code and every cause', () => {
    const answer = composeLocalAnswer(assessment({
      dtcs: ['P0128', 'P0300'],
      possibleCauses: ['Termostato bloqueado abierto', 'Bujías desgastadas']
    }))

    expect(answer).toContain('P0128')
    expect(answer).toContain('P0300')
    expect(answer).toContain('Termostato bloqueado abierto')
    expect(answer).toContain('Bujías desgastadas')
  })
})
