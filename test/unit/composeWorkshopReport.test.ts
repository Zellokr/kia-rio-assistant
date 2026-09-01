import { describe, expect, it } from 'vitest'

import type {
  DiagnosticAssessment
} from '../../core/obd/diagnostics/assessDiagnostics'
import type {
  DtcReadOutcome
} from '../../core/obd/usecases/readDiagnosticCodes'
import {
  composeWorkshopReport
} from '../../core/report/composeWorkshopReport'

/**
 * RF-037: *"El informe distingue hechos, interpretación y limitaciones."*
 *
 * That sentence is the whole design. A workshop reads this without the app,
 * without the driver, and often without the car in front of them, so the one
 * thing it must never do is let this tool's inference read as something the
 * vehicle said.
 */

function assessment(
  overrides: Partial<DiagnosticAssessment> = {}
): DiagnosticAssessment {
  return {
    severity: 'warning',
    confidence: 'medium',
    dtcs: ['P0133'],
    evidence: [{ type: 'dtc', description: 'Código P0133 almacenado' }],
    possibleCauses: ['Sonda lambda degradada'],
    immediateAction: 'Puedes seguir conduciendo con precaución.',
    recommendedChecks: ['Revisar la sonda lambda del banco 1'],
    limitations: ['No se ha confirmado la causa mediante OBD-II'],
    ...overrides
  }
}

function report(overrides: Record<string, unknown> = {}): string {
  return composeWorkshopReport({
    sessionId: 'session-1',
    startedAt: '2026-09-02T18:00:00.000Z',
    reads: [],
    assessment: null,
    telemetry: [],
    generatedAtMs: Date.parse('2026-09-02T19:00:00.000Z'),
    ...overrides
  } as never)
}

function sectionOf(text: string, heading: string): string {
  const headings = ['HECHOS', 'INTERPRETACIÓN', 'LIMITACIONES']
  const start = text.indexOf(heading)
  const nextIndexes = headings
    .filter(other => other !== heading)
    .map(other => text.indexOf(other))
    .filter(index => index > start)

  return text.slice(start, Math.min(...nextIndexes, text.length))
}

describe('composeWorkshopReport', () => {
  it('always carries the three sections, in order', () => {
    const text = report()

    expect(text.indexOf('HECHOS')).toBeGreaterThan(-1)
    expect(text.indexOf('INTERPRETACIÓN')).toBeGreaterThan(text.indexOf('HECHOS'))
    expect(text.indexOf('LIMITACIONES'))
      .toBeGreaterThan(text.indexOf('INTERPRETACIÓN'))
  })

  it('reports codes the vehicle actually returned as facts', () => {
    const reads: DtcReadOutcome[] = [{
      kind: 'codes',
      state: 'stored',
      codes: [{ code: 'P0133', type: 'powertrain', state: 'stored' }] as never,
      complete: true
    }]

    expect(sectionOf(report({ reads }), 'HECHOS')).toContain('P0133')
  })

  /**
   * The distinction `readDiagnosticCodes` exists to protect. A workshop told
   * "no pending codes" when the truth is "the car never answered" would rule
   * out a fault nobody ruled out.
   */
  it('never turns silence into a clean bill of health', () => {
    const facts = sectionOf(report({
      reads: [{ kind: 'unconfirmed', state: 'pending', reason: 'no-data' }]
    }), 'HECHOS')

    expect(facts).toContain('no respondió')
    expect(facts).toContain('no es un cero confirmado')
    expect(facts).not.toContain('sin códigos')
  })

  it('separates a reported zero from an unanswered read', () => {
    const facts = sectionOf(report({
      reads: [{ kind: 'no-codes-reported', state: 'stored' }]
    }), 'HECHOS')

    expect(facts).toContain('informó de cero códigos')
    expect(facts).not.toContain('no es un cero confirmado')
  })

  it('says plainly when a read did not happen', () => {
    const facts = sectionOf(report({
      reads: [{ kind: 'failed', state: 'permanent', reason: 'timeout' }]
    }), 'HECHOS')

    expect(facts).toContain('no se pudo leer')
  })

  it('keeps the tool\'s conclusions out of the facts', () => {
    const text = report({
      reads: [{ kind: 'no-codes-reported', state: 'stored' }],
      assessment: assessment()
    })

    const facts = sectionOf(text, 'HECHOS')
    const interpretation = sectionOf(text, 'INTERPRETACIÓN')

    expect(facts).not.toContain('Sonda lambda degradada')
    expect(interpretation).toContain('Sonda lambda degradada')
    expect(interpretation).toContain('Puedes seguir conduciendo con precaución.')
    expect(interpretation).toContain('Revisar la sonda lambda del banco 1')
  })

  it('says nothing was concluded rather than leaving the section empty', () => {
    const interpretation = sectionOf(report({ assessment: null }), 'INTERPRETACIÓN')

    expect(interpretation).toContain('No se ha emitido ninguna evaluación')
  })

  it('always states the limits that hold for every session', () => {
    const limits = sectionOf(report(), 'LIMITACIONES')

    // Read-only: a workshop must know no code was cleared before they arrived.
    expect(limits).toContain('solo lectura')
    expect(limits).toContain('no se ha borrado ningún código')
    // The catalogue is SAE generic, so a Kia-specific code has no entry.
    expect(limits).toContain('genérico SAE')
    // Mode 02 is not in the read-only allowlist, so no freeze frame exists.
    expect(limits).toContain('trama congelada')
  })

  it('carries the assessment\'s own limitations into the limits', () => {
    const limits = sectionOf(report({ assessment: assessment() }), 'LIMITACIONES')

    expect(limits).toContain('No se ha confirmado la causa mediante OBD-II')
  })

  it('flags a read that could not be fully decoded', () => {
    const limits = sectionOf(report({
      reads: [{
        kind: 'codes',
        state: 'stored',
        codes: [{ code: 'P0133', type: 'powertrain', state: 'stored' }] as never,
        complete: false,
        incompleteReason: 'unvalidated-multi-frame'
      }]
    }), 'LIMITACIONES')

    expect(limits).toContain('no se pudo decodificar por completo')
  })

  it('lists the readings taken, with their units', () => {
    const facts = sectionOf(report({
      telemetry: [{ label: 'Temperatura refrigerante', value: 89, unit: '°C' }]
    }), 'HECHOS')

    expect(facts).toContain('Temperatura refrigerante')
    expect(facts).toContain('89')
    expect(facts).toContain('°C')
  })

  it('identifies the session it describes', () => {
    const text = report()

    expect(text).toContain('session-1')
    expect(text).toContain('2026-09-02')
  })
})
