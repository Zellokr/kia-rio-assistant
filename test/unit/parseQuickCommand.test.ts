import { describe, expect, it } from 'vitest'

import { parseQuickCommand } from '../../core/assistant/parseQuickCommand'

describe('parseQuickCommand', () => {
  describe('the five commands of §11', () => {
    it('recognises estado', () => {
      expect(parseQuickCommand('estado')?.intent).toBe('status')
    })

    it('recognises DTC', () => {
      expect(parseQuickCommand('dtc')?.intent).toBe('read-dtc')
    })

    it('recognises temperatura', () => {
      expect(parseQuickCommand('temperatura')?.intent).toBe('temperature')
    })

    it('recognises testigo', () => {
      expect(parseQuickCommand('testigo')?.intent).toBe('warning-light')
    })

    it('recognises guardar nota', () => {
      expect(parseQuickCommand('guardar nota')?.intent).toBe('save-note')
    })
  })

  /**
   * Typed one-handed, possibly at a traffic light. Every one of these is a
   * thing a real person types, not a variation invented to pad a test.
   */
  describe('forgiveness', () => {
    it('ignores case', () => {
      expect(parseQuickCommand('ESTADO')?.intent).toBe('status')
    })

    it('ignores missing accents, which no one types in a hurry', () => {
      expect(parseQuickCommand('averia')?.intent).toBe('read-dtc')

      expect(parseQuickCommand('avería')?.intent).toBe('read-dtc')
    })

    it('ignores surrounding words', () => {
      expect(parseQuickCommand('dime la temperatura del motor')?.intent)
        .toBe('temperature')
    })

    it('ignores surrounding whitespace', () => {
      expect(parseQuickCommand('   estado  ')?.intent).toBe('status')
    })

    it('accepts the plural', () => {
      expect(parseQuickCommand('testigos')?.intent).toBe('warning-light')

      expect(parseQuickCommand('averias')?.intent).toBe('read-dtc')
    })

    it('accepts common synonyms for faults', () => {
      expect(parseQuickCommand('codigos')?.intent).toBe('read-dtc')

      expect(parseQuickCommand('fallos')?.intent).toBe('read-dtc')
    })
  })

  describe('no match', () => {
    it('returns null for empty input', () => {
      expect(parseQuickCommand('')).toBeNull()
    })

    it('returns null for whitespace', () => {
      expect(parseQuickCommand('   ')).toBeNull()
    })

    /**
     * Silence beats a guess. A wrong command in a car is worse than none,
     * and the AI provider that will handle open questions does not exist
     * yet — until it does, unmatched text has nowhere to go.
     */
    it('returns null rather than guessing at an open question', () => {
      expect(parseQuickCommand('por que suena raro el motor')).toBeNull()
    })

    it('does not match a keyword buried inside another word', () => {
      expect(parseQuickCommand('contestador')).toBeNull()
    })
  })

  describe('more than one keyword', () => {
    it('takes the first one, so the result is predictable', () => {
      expect(parseQuickCommand('estado y temperatura')?.intent)
        .toBe('status')

      expect(parseQuickCommand('temperatura y estado')?.intent)
        .toBe('temperature')
    })
  })

  describe('support', () => {
    it('marks the four commands that have something behind them', () => {
      for (const input of ['estado', 'dtc', 'temperatura', 'testigo']) {
        expect(parseQuickCommand(input)?.supported).toBe(true)
      }
    })

    /**
     * §11 lists it, so it parses. Nothing in the app stores a note yet —
     * notes belong to Fase 4's maintenance records — so claiming support
     * would be a lie the UI would then have to tell.
     */
    it('marks guardar nota as not yet supported', () => {
      expect(parseQuickCommand('guardar nota')?.supported).toBe(false)
    })
  })
})
