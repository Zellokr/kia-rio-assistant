import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_REQUEST_FIELDS,
  MAX_ASSISTANT_HISTORY_TURNS,
  buildAssistantRequest
} from '../../core/assistant/buildAssistantRequest'
import type {
  AssistantTurn
} from '../../core/assistant/buildAssistantRequest'
import type {
  DiagnosticAssessment
} from '../../core/obd/diagnostics/assessDiagnostics'
import type {
  ObdTelemetryMetric
} from '../../core/obd/telemetry/ObdTelemetryStore'

const NOW_MS = Date.parse('2026-08-29T10:00:00.000Z')

const ASSESSMENT: DiagnosticAssessment = {
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
  limitations: ['No se ha confirmado la causa mediante OBD-II']
}

function metric(
  overrides: Partial<ObdTelemetryMetric> = {}
): ObdTelemetryMetric {
  return {
    key: 'coolantTemperature',
    pid: '0105',
    label: 'Temperatura del refrigerante',
    value: 89,
    unit: '°C',
    updatedAt: '2026-08-29T09:59:59.000Z',
    latencyMs: 42,
    ...overrides
  }
}

function turn(index: number): AssistantTurn {
  return {
    role: index % 2 === 0 ? 'user' : 'assistant',
    text: `turno ${index}`
  }
}

describe('buildAssistantRequest', () => {
  describe('the query', () => {
    it('carries the typed or transcribed text', () => {
      const request = buildAssistantRequest({
        query: { text: '¿qué significa este código?', intent: 'read-dtc' },
        nowMs: NOW_MS
      })

      expect(request?.query.text).toBe('¿qué significa este código?')
      expect(request?.query.intent).toBe('read-dtc')
    })

    it('trims the surrounding whitespace of the text', () => {
      const request = buildAssistantRequest({
        query: { text: '   estado   ', intent: 'status' },
        nowMs: NOW_MS
      })

      expect(request?.query.text).toBe('estado')
    })

    /**
     * An empty query is a caller defect, and sending it spends a provider
     * call to invite the model to invent the question it was not asked.
     */
    it('refuses to build a request for a blank query', () => {
      expect(buildAssistantRequest({
        query: { text: '   ', intent: null },
        nowMs: NOW_MS
      })).toBeNull()
    })

    it('accepts a query with no recognised quick command', () => {
      const request = buildAssistantRequest({
        query: { text: '¿puedo llegar a casa?', intent: null },
        nowMs: NOW_MS
      })

      expect(request?.query.intent).toBeNull()
    })
  })

  describe('the local assessment', () => {
    it('carries every §8.2 field unchanged', () => {
      const request = buildAssistantRequest({
        query: { text: 'estado', intent: 'status' },
        assessment: ASSESSMENT,
        nowMs: NOW_MS
      })

      expect(request?.assessment).toEqual(ASSESSMENT)
    })

    it('reports no assessment when nothing has been read yet', () => {
      const request = buildAssistantRequest({
        query: { text: 'estado', intent: 'status' },
        nowMs: NOW_MS
      })

      expect(request?.assessment).toBeNull()
    })
  })

  describe('telemetry', () => {
    it('carries a fresh reading with its age, not its latency', () => {
      const request = buildAssistantRequest({
        query: { text: 'temperatura', intent: 'temperature' },
        telemetry: [metric()],
        nowMs: NOW_MS
      })

      expect(request?.telemetry).toEqual([
        {
          key: 'coolantTemperature',
          pid: '0105',
          label: 'Temperatura del refrigerante',
          value: 89,
          unit: '°C',
          ageMs: 1000
        }
      ])
    })

    /**
     * A frozen reading and a live one are indistinguishable once they are
     * two numbers in a payload — the defect found at the car on 2026-08-28.
     * §9.4 forbids the AI asserting values it cannot know, and the only way
     * to enforce that is to not send the value.
     */
    it('drops a stale reading and names it as omitted', () => {
      const request = buildAssistantRequest({
        query: { text: 'temperatura', intent: 'temperature' },
        telemetry: [
          metric(),
          metric({
            key: 'engineRpm',
            pid: '010C',
            label: 'Régimen del motor',
            value: 820,
            unit: 'rpm',
            updatedAt: '2026-08-29T09:59:00.000Z'
          })
        ],
        nowMs: NOW_MS
      })

      expect(request?.telemetry.map(reading => reading.key))
        .toEqual(['coolantTemperature'])

      expect(request?.omissions).toContainEqual({
        kind: 'stale-telemetry',
        keys: ['engineRpm']
      })
    })

    it('drops a reading whose timestamp cannot be read', () => {
      const request = buildAssistantRequest({
        query: { text: 'temperatura', intent: 'temperature' },
        telemetry: [metric({ updatedAt: 'no es una fecha' })],
        nowMs: NOW_MS
      })

      expect(request?.telemetry).toEqual([])

      expect(request?.omissions).toContainEqual({
        kind: 'stale-telemetry',
        keys: ['coolantTemperature']
      })
    })
  })

  /**
   * RF-032 is accepted only if "la petición no contiene el historial
   * completo". The bound lives here rather than at the call site so a caller
   * cannot forget it.
   */
  describe('conversation history', () => {
    it('keeps only the most recent turns, in order', () => {
      const history = Array.from({ length: 10 }, (_, index) => turn(index))

      const request = buildAssistantRequest({
        query: { text: '¿y eso es grave?', intent: null },
        history,
        nowMs: NOW_MS
      })

      expect(request?.recentTurns)
        .toEqual(history.slice(-MAX_ASSISTANT_HISTORY_TURNS))
    })

    it('names how many turns it withheld', () => {
      const history = Array.from({ length: 10 }, (_, index) => turn(index))

      const request = buildAssistantRequest({
        query: { text: '¿y eso es grave?', intent: null },
        history,
        nowMs: NOW_MS
      })

      expect(request?.omissions).toContainEqual({
        kind: 'history-truncated',
        droppedTurns: 10 - MAX_ASSISTANT_HISTORY_TURNS
      })
    })

    it('withholds nothing when the history already fits', () => {
      const request = buildAssistantRequest({
        query: { text: '¿y eso es grave?', intent: null },
        history: [turn(0), turn(1)],
        nowMs: NOW_MS
      })

      expect(request?.recentTurns).toHaveLength(2)
      expect(request?.omissions).toEqual([])
    })

    it('carries only a role and text per turn', () => {
      const request = buildAssistantRequest({
        query: { text: '¿y eso es grave?', intent: null },
        history: [turn(0)],
        nowMs: NOW_MS
      })

      expect(Object.keys(request?.recentTurns[0] ?? {}).sort())
        .toEqual(['role', 'text'])
    })
  })

  /**
   * The other half of RF-032's acceptance: "ni audio". There is no audio
   * field to populate, and this is the test that fails when someone adds
   * one — or a VIN, a location, or a raw session log — years from now.
   */
  describe('what leaves the device', () => {
    it('has exactly the declared top-level fields', () => {
      const request = buildAssistantRequest({
        query: { text: 'estado', intent: 'status' },
        assessment: ASSESSMENT,
        telemetry: [metric()],
        history: [turn(0)],
        nowMs: NOW_MS
      })

      expect(Object.keys(request ?? {}).sort())
        .toEqual([...ASSISTANT_REQUEST_FIELDS].sort())
    })

    it('survives serialisation, because that is how it travels', () => {
      const request = buildAssistantRequest({
        query: { text: 'estado', intent: 'status' },
        assessment: ASSESSMENT,
        telemetry: [metric()],
        history: [turn(0)],
        nowMs: NOW_MS
      })

      expect(JSON.parse(JSON.stringify(request))).toEqual(request)
    })
  })
})
