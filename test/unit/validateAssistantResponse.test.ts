import { describe, expect, it } from 'vitest'

import { buildAssistantRequest } from '../../core/assistant/buildAssistantRequest'
import type {
  AssistantRequest
} from '../../core/assistant/buildAssistantRequest'
import {
  validateAssistantResponse
} from '../../core/assistant/validateAssistantResponse'
import type {
  DiagnosticAssessment
} from '../../core/obd/diagnostics/assessDiagnostics'
import type { DiagnosticSeverity } from '../../core/obd/diagnostics/ports'

const NOW_MS = Date.parse('2026-08-29T10:00:00.000Z')

const CRITICAL_ACTION
  = 'Detén el vehículo en un lugar seguro, apaga el motor y no sigas '
    + 'conduciendo hasta que un taller revise el fallo.'

const WARNING_ACTION
  = 'Puedes seguir conduciendo con precaución, pero lleva el vehículo a '
    + 'un taller para que revise el fallo lo antes posible.'

function assessment(
  severity: DiagnosticSeverity = 'warning',
  dtcs: readonly string[] = ['P0128']
): DiagnosticAssessment {
  return {
    severity,
    confidence: 'medium',
    dtcs,
    evidence: [],
    possibleCauses: ['Termostato bloqueado abierto'],
    immediateAction: severity === 'critical'
      ? CRITICAL_ACTION
      : WARNING_ACTION,
    recommendedChecks: [],
    limitations: []
  }
}

function request(
  overrides: {
    severity?: DiagnosticSeverity
    dtcs?: readonly string[]
    withTelemetry?: boolean
  } = {}
): AssistantRequest {
  const built = buildAssistantRequest({
    query: { text: 'estado', intent: 'status' },
    assessment: assessment(overrides.severity, overrides.dtcs),
    telemetry: overrides.withTelemetry
      ? [{
          key: 'coolantTemperature',
          pid: '0105',
          label: 'Temperatura del refrigerante',
          value: 89,
          unit: '°C',
          updatedAt: '2026-08-29T09:59:59.000Z',
          latencyMs: 42
        }]
      : [],
    nowMs: NOW_MS
  })

  if (!built) {
    throw new Error('the fixture query must build a request')
  }

  return built
}

function reasonKinds(text: string, payload: AssistantRequest) {
  const validation = validateAssistantResponse(text, payload)

  return validation.outcome === 'rejected'
    ? validation.reasons.map(reason => reason.kind)
    : []
}

describe('validateAssistantResponse', () => {
  it('accepts an answer that stays inside the evidence it was given', () => {
    const validation = validateAssistantResponse(
      'El código P0128 apunta al termostato. Lleva el coche a un taller.',
      request()
    )

    expect(validation.outcome).toBe('accepted')
  })

  it('trims the accepted text', () => {
    const validation = validateAssistantResponse(
      '  Lleva el coche a un taller.  ',
      request()
    )

    expect(validation.outcome === 'accepted' && validation.text)
      .toBe('Lleva el coche a un taller.')
  })

  it('rejects an empty answer', () => {
    expect(reasonKinds('   \n  ', request())).toEqual(['empty'])
  })

  /** §9.4: "Inventar PIDs, DTC, valores, piezas o procedimientos." */
  describe('invented codes', () => {
    it('rejects a DTC the request never carried', () => {
      expect(reasonKinds(
        'También tienes un P0300 por fallo de encendido.',
        request()
      )).toContain('unknown-dtc')
    })

    it('names the invented code', () => {
      const validation = validateAssistantResponse(
        'Tienes P0300 y P0420.',
        request()
      )

      expect(validation.outcome === 'rejected' && validation.reasons)
        .toContainEqual({ kind: 'unknown-dtc', codes: ['P0300', 'P0420'] })
    })

    it('accepts a code that was sent, whatever its case', () => {
      expect(reasonKinds('El código p0128 es el termostato.', request()))
        .toEqual([])
    })

    it('rejects any DTC when no assessment was sent', () => {
      const built = buildAssistantRequest({
        query: { text: 'hola', intent: null },
        nowMs: NOW_MS
      })!

      expect(reasonKinds('Seguramente sea un P0128.', built))
        .toContain('unknown-dtc')
    })

    it('rejects a PID the request never carried', () => {
      expect(reasonKinds(
        'Consulta el PID 010C para ver el régimen.',
        request({ withTelemetry: true })
      )).toContain('unknown-pid')
    })

    it('accepts a PID that was sent', () => {
      expect(reasonKinds(
        'El PID 0105 da 89 °C.',
        request({ withTelemetry: true })
      )).toEqual([])
    })

    /**
     * "P0128" must not read as the PID "0128". The letter binds to the
     * digits, so the code is a code and nothing else.
     */
    it('does not read a DTC as a PID', () => {
      expect(reasonKinds('El código P0128 es el termostato.', request()))
        .toEqual([])
    })
  })

  /**
   * §9.4: "Autorizar que el usuario siga conduciendo."
   *
   * The rules engine holds that authority. The test is not whether the
   * sentence sounds reassuring — it is whether the local action already
   * grants what the answer grants.
   */
  describe('authorising the driver to continue', () => {
    it('rejects an authorisation the local action does not grant', () => {
      expect(reasonKinds(
        'Es seguro conducir hasta el taller, no te preocupes.',
        request({ severity: 'critical' })
      )).toContain('authorises-driving')
    })

    it('rejects it however it is phrased', () => {
      const critical = request({ severity: 'critical' })

      expect(reasonKinds('Puedes seguir conduciendo.', critical))
        .toContain('authorises-driving')

      expect(reasonKinds('No hay problema en conducir.', critical))
        .toContain('authorises-driving')

      expect(reasonKinds('Puedes continuar el viaje.', critical))
        .toContain('authorises-driving')
    })

    it('ignores the accents the model may or may not write', () => {
      expect(reasonKinds(
        'Puedes seguir conduciendo sin más.',
        request({ severity: 'critical' })
      )).toContain('authorises-driving')
    })

    /**
     * The local `warning` action says "Puedes seguir conduciendo con
     * precaución" itself. Repeating what the rules engine already decided is
     * summarising, which §9.3 explicitly allows.
     */
    it('allows what the local action itself already says', () => {
      expect(reasonKinds(
        'Puedes seguir conduciendo con precaución hasta el taller.',
        request({ severity: 'warning' })
      )).toEqual([])
    })
  })

  /**
   * §9.4: "Cambiar una severidad crítica calculada por reglas sin una
   * política explícita." There is no such policy, so a critical stays
   * critical.
   */
  describe('softening a critical severity', () => {
    it('rejects an answer that plays down a critical finding', () => {
      expect(reasonKinds(
        'No es grave, puedes mirarlo cuando tengas tiempo.',
        request({ severity: 'critical' })
      )).toContain('downgrades-severity')
    })

    it('leaves a warning alone, which no rule protects', () => {
      expect(reasonKinds(
        'No es grave, pero conviene revisarlo.',
        request({ severity: 'warning' })
      )).toEqual([])
    })
  })

  /** §9.4: "Afirmar que una reparación concreta solucionará el fallo." */
  describe('promising a repair', () => {
    it('rejects a promise that a part will fix it', () => {
      expect(reasonKinds(
        'Cambiar el termostato solucionará el problema.',
        request()
      )).toContain('promises-a-repair')
    })

    it('rejects "basta con"', () => {
      expect(reasonKinds(
        'Basta con cambiar el termostato.',
        request()
      )).toContain('promises-a-repair')
    })

    it('accepts a cause named as a possibility', () => {
      expect(reasonKinds(
        'Una causa posible es un termostato bloqueado abierto. '
        + 'Que lo revise un taller.',
        request()
      )).toEqual([])
    })
  })

  it('reports every rule an answer breaks, not just the first', () => {
    const kinds = reasonKinds(
      'No es grave: puedes seguir conduciendo. Un P0420 así se '
      + 'soluciona con una sonda nueva.',
      request({ severity: 'critical' })
    )

    expect(kinds).toContain('unknown-dtc')
    expect(kinds).toContain('authorises-driving')
    expect(kinds).toContain('downgrades-severity')
    expect(kinds).toContain('promises-a-repair')
  })
})
