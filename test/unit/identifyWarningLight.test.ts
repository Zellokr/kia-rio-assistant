import {
  describe,
  expect,
  it
} from 'vitest'

import {
  LIGHT_QUESTIONS,
  identifyWarningLight
} from '../../core/obd/diagnostics/identifyWarningLight'
import type {
  WarningLightCatalog,
  WarningLightEntry
} from '../../core/obd/diagnostics/ports'

const CHECK_ENGINE: WarningLightEntry = {
  id: 'check-engine',
  name: 'Testigo de avería del motor',
  color: 'amber',
  shape: 'engine-outline',
  behavior: ['steady'],
  displayTextKeywords: ['CHECK', 'ENGINE'],
  symptoms: ['Pérdida de potencia'],
  severity: 'warning',
  immediateAction: 'Revisa el fallo lo antes posible.',
  recommendedChecks: ['Leer los códigos de diagnóstico'],
  associatedDtcCodes: [],
  associatedDtcPrefixes: ['P0'],
  subsystems: ['engine']
}

const CHECK_ENGINE_BLINKING: WarningLightEntry = {
  ...CHECK_ENGINE,
  id: 'check-engine-blinking',
  name: 'Testigo de avería del motor parpadeando',
  behavior: ['blinking'],
  severity: 'critical',
  immediateAction: 'Detén el vehículo en un lugar seguro.'
}

const OIL_PRESSURE: WarningLightEntry = {
  id: 'oil-pressure',
  name: 'Presión de aceite',
  color: 'red',
  shape: 'oil-can',
  behavior: ['steady'],
  displayTextKeywords: [],
  symptoms: ['Ruido metálico en el motor'],
  severity: 'critical',
  immediateAction: 'Detén el vehículo en un lugar seguro.',
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
  immediateAction: 'Reposta en la próxima gasolinera.',
  recommendedChecks: ['Comprobar el nivel de combustible'],
  associatedDtcCodes: [],
  associatedDtcPrefixes: [],
  subsystems: ['fuel']
}

const catalog: WarningLightCatalog = {
  all: () => [
    CHECK_ENGINE,
    CHECK_ENGINE_BLINKING,
    OIL_PRESSURE,
    LOW_FUEL
  ],
  byId: id => catalog.all().find(entry => entry.id === id)
}

describe('identifyWarningLight', () => {
  it('asks the five spec §11.1 questions in order', () => {
    expect([...LIGHT_QUESTIONS]).toEqual([
      'color',
      'shape',
      'behavior',
      'displayText',
      'symptoms'
    ])
  })

  describe('narrowing', () => {
    it('returns candidates while more than one entry still fits', () => {
      const result = identifyWarningLight(
        { answers: { color: 'amber' }, adapterConnected: true },
        catalog
      )

      expect(result.kind).toBe('candidates')
      expect(
        result.kind === 'candidates'
        && result.candidates.map(entry => entry.id).sort()
      ).toEqual(['check-engine', 'check-engine-blinking', 'low-fuel'])
    })

    /**
     * A next question is only worth asking if it can still split the set.
     * Asking one every candidate answers identically wastes the driver's
     * time and pretends the flow is making progress.
     */
    it('suggests only a question that still discriminates', () => {
      const result = identifyWarningLight(
        {
          answers: { color: 'amber', shape: 'engine-outline' },
          adapterConnected: true
        },
        catalog
      )

      expect(result).toMatchObject({
        kind: 'candidates',
        nextQuestion: 'behavior'
      })
    })

    it('offers no next question when none can split the remaining set', () => {
      const result = identifyWarningLight(
        {
          answers: {
            color: 'amber',
            shape: 'engine-outline',
            behavior: 'steady',
            displayText: 'CHECK ENGINE',
            symptoms: ['Pérdida de potencia']
          },
          adapterConnected: true
        },
        catalog
      )

      expect(result.kind).toBe('match')
    })

    it('reaches a single match through the guided script', () => {
      const result = identifyWarningLight(
        {
          answers: {
            color: 'amber',
            shape: 'engine-outline',
            behavior: 'blinking'
          },
          adapterConnected: true
        },
        catalog
      )

      expect(result).toMatchObject({
        kind: 'match',
        light: { id: 'check-engine-blinking' }
      })
    })

    it('matches on-screen text against declared keywords only', () => {
      const result = identifyWarningLight(
        {
          answers: { displayText: 'check engine' },
          adapterConnected: true
        },
        catalog
      )

      expect(
        result.kind === 'candidates'
        && result.candidates.map(entry => entry.id).sort()
      ).toEqual(['check-engine', 'check-engine-blinking'])
    })
  })

  describe('unidentified', () => {
    /**
     * Constraint: "no identificado" is always available and never forced
     * into a best guess. The flow ends the moment the user opts out, no
     * matter how many questions remain.
     */
    it('ends immediately when the user opts out mid-flow', () => {
      const result = identifyWarningLight(
        {
          answers: { color: 'amber', optedOut: true },
          adapterConnected: true
        },
        catalog
      )

      expect(result.kind).toBe('unidentified')
      expect(
        result.kind === 'unidentified' && result.safeAlternative
      ).toBeDefined()
    })

    it('never auto-selects the closest non-matching entry', () => {
      const result = identifyWarningLight(
        {
          answers: { color: 'blue', shape: 'engine-outline' },
          adapterConnected: true
        },
        catalog
      )

      expect(result.kind).toBe('unidentified')
    })

    it('always carries a safe alternative with an action and a limitation', () => {
      const result = identifyWarningLight(
        { answers: { optedOut: true }, adapterConnected: true },
        catalog
      )

      expect(result.kind).toBe('unidentified')

      if (result.kind !== 'unidentified') {
        return
      }

      expect(
        result.safeAlternative.immediateAction.length
      ).toBeGreaterThan(0)
      expect(
        result.safeAlternative.recommendedChecks.length
      ).toBeGreaterThan(0)
      expect(
        result.safeAlternative.limitations.length
      ).toBeGreaterThan(0)
    })

    /**
     * An unidentified RED light is the one case where guessing low would
     * be dangerous: red is the dashboard's own "stop" convention.
     */
    it('floors an unidentified red light at critical', () => {
      const result = identifyWarningLight(
        { answers: { color: 'red', optedOut: true }, adapterConnected: true },
        catalog
      )

      expect(
        result.kind === 'unidentified'
        && result.safeAlternative.severityFloor
      ).toBe('critical')
    })

    it('floors an unidentified light of unknown colour at warning', () => {
      const result = identifyWarningLight(
        { answers: { optedOut: true }, adapterConnected: true },
        catalog
      )

      expect(
        result.kind === 'unidentified'
        && result.safeAlternative.severityFloor
      ).toBe('warning')
    })
  })

  describe('no adapter connected', () => {
    const answers = {
      color: 'amber',
      shape: 'engine-outline',
      behavior: 'blinking'
    } as const

    it('caps a match at low confidence', () => {
      const result = identifyWarningLight(
        { answers, adapterConnected: false },
        catalog
      )

      expect(result).toMatchObject({
        kind: 'match',
        confidence: 'low'
      })
    })

    it('states that the cause is not confirmed', () => {
      const result = identifyWarningLight(
        { answers, adapterConnected: false },
        catalog
      )

      expect(
        result.kind === 'match' && result.limitations
      ).toContain('No se ha confirmado la causa mediante OBD-II')
    })

    /**
     * Capping confidence withholds certainty, never guidance: the driver
     * still gets the light's severity and its conservative action.
     */
    it('still surfaces the light severity and its action', () => {
      const result = identifyWarningLight(
        { answers, adapterConnected: false },
        catalog
      )

      expect(result).toMatchObject({
        kind: 'match',
        light: {
          severity: 'critical',
          immediateAction: 'Detén el vehículo en un lugar seguro.'
        }
      })
    })

    it('adds the same limitation to an unidentified outcome', () => {
      const result = identifyWarningLight(
        { answers: { optedOut: true }, adapterConnected: false },
        catalog
      )

      expect(
        result.kind === 'unidentified'
        && result.safeAlternative.limitations
      ).toContain('No se ha confirmado la causa mediante OBD-II')
    })
  })

  describe('confidence with an adapter connected', () => {
    it('does not claim high confidence from the guided flow alone', () => {
      const result = identifyWarningLight(
        {
          answers: {
            color: 'amber',
            shape: 'engine-outline',
            behavior: 'blinking',
            displayText: 'CHECK',
            symptoms: ['Pérdida de potencia']
          },
          adapterConnected: true
        },
        catalog
      )

      expect(
        result.kind === 'match' && result.confidence
      ).toBe('medium')
    })

    it('stays low when the match came from a partly answered script', () => {
      const result = identifyWarningLight(
        {
          answers: { color: 'red' },
          adapterConnected: true
        },
        catalog
      )

      expect(result).toMatchObject({
        kind: 'match',
        light: { id: 'oil-pressure' },
        confidence: 'low'
      })
    })
  })

  it('always echoes the answers it was given', () => {
    const answers = { color: 'red' } as const
    const result = identifyWarningLight(
      { answers, adapterConnected: true },
      catalog
    )

    expect(result.answers).toEqual(answers)
  })
})
