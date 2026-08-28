import { describe, expect, it } from 'vitest'

import {
  composeAssessmentAnnouncement
} from '../../core/speech/composeAssessmentAnnouncement'
import type {
  DiagnosticAssessment
} from '../../core/obd/diagnostics/assessDiagnostics'
import type {
  DiagnosticConfidence,
  DiagnosticSeverity
} from '../../core/obd/diagnostics/ports'

function assessment(
  severity: DiagnosticSeverity,
  confidence: DiagnosticConfidence = 'high',
  immediateAction = 'Acude a un taller.'
): DiagnosticAssessment {
  return {
    severity,
    confidence,
    evidence: [],
    possibleCauses: [],
    immediateAction,
    limitations: []
  }
}

describe('composeAssessmentAnnouncement', () => {
  /**
   * Silence is the correct output here. The screen already shows the result,
   * and speaking "todo correcto" after every read is the aggressive
   * repetition §11 rules out — it also trains the driver to ignore the voice
   * before it ever says something that matters.
   */
  it('says nothing for an informational assessment', () => {
    expect(composeAssessmentAnnouncement(assessment('info')))
      .toBeNull()
  })

  it('leads a warning with a word that is not an alarm', () => {
    expect(composeAssessmentAnnouncement(assessment('warning')))
      .toBe('Aviso. Acude a un taller.')
  })

  it('leads a critical assessment with an alarm', () => {
    expect(composeAssessmentAnnouncement(assessment('critical')))
      .toBe('Atención. Acude a un taller.')
  })

  it('carries the action, because that is the part that matters', () => {
    const spoken = composeAssessmentAnnouncement(
      assessment('critical', 'high', 'Detén el vehículo en un lugar seguro.')
    )

    expect(spoken).toContain('Detén el vehículo en un lugar seguro.')
  })

  /**
   * The project's evidence discipline, spoken. An unconfirmed finding must
   * not sound like a confirmed one just because it is said out loud.
   */
  describe('low confidence', () => {
    it('hedges a warning aloud', () => {
      expect(composeAssessmentAnnouncement(assessment('warning', 'low')))
        .toBe('Aviso sin confirmar. Acude a un taller.')
    })

    it('hedges a critical assessment without softening the action', () => {
      const spoken = composeAssessmentAnnouncement(
        assessment('critical', 'low', 'Detén el vehículo.')
      )

      expect(spoken).toBe('Atención, sin confirmar. Detén el vehículo.')
    })

    it('does not hedge at medium confidence', () => {
      expect(composeAssessmentAnnouncement(assessment('warning', 'medium')))
        .toBe('Aviso. Acude a un taller.')
    })
  })

  describe('repetition', () => {
    it('stays quiet when it would say the same thing again', () => {
      const previous = 'Aviso. Acude a un taller.'

      expect(composeAssessmentAnnouncement(
        assessment('warning'),
        { previous }
      )).toBeNull()
    })

    it('speaks when the assessment escalates', () => {
      const previous = 'Aviso. Acude a un taller.'

      expect(composeAssessmentAnnouncement(
        assessment('critical'),
        { previous }
      )).toBe('Atención. Acude a un taller.')
    })

    it('speaks when the action changes under the same severity', () => {
      const previous = 'Aviso. Acude a un taller.'

      expect(composeAssessmentAnnouncement(
        assessment('warning', 'high', 'Revisa el nivel de refrigerante.'),
        { previous }
      )).toBe('Aviso. Revisa el nivel de refrigerante.')
    })
  })

  describe('a missing action', () => {
    it('still announces the severity rather than nothing', () => {
      expect(composeAssessmentAnnouncement(assessment('critical', 'high', '')))
        .toBe('Atención.')
    })

    it('ignores an action that is only whitespace', () => {
      expect(composeAssessmentAnnouncement(
        assessment('warning', 'high', '   ')
      )).toBe('Aviso.')
    })
  })
})
