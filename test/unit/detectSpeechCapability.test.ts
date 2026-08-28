import { describe, expect, it } from 'vitest'

import {
  detectSpeechCapability,
  type SpeechCapabilityHost
} from '../../core/speech/detectSpeechCapability'

/** A constructor that exists but fails on use — the exact case the probe refuses to call working. */
class RecognitionStub {
  start(): void {
    throw new Error('only a real start() proves recognition works')
  }
}

function host(
  overrides: Partial<SpeechCapabilityHost>
): SpeechCapabilityHost {
  return { ...overrides }
}

describe('detectSpeechCapability', () => {
  it('reports both halves absent on a bare host', () => {
    const report = detectSpeechCapability(host({}))

    expect(report.synthesis).toBe('absent')

    expect(report.recognition).toBe('absent')

    expect(report.recognitionVendor).toBeNull()
  })

  it('never claims a reachable API is a working one', () => {
    const report = detectSpeechCapability(host({}))

    expect(report.provesItWorks).toBe(false)
  })

  describe('synthesis', () => {
    it('is available when voices are enumerable', () => {
      const report = detectSpeechCapability(host({
        speechSynthesis: {
          getVoices: () => [
            { lang: 'es-ES' },
            { lang: 'en-US' }
          ]
        }
      }))

      expect(report.synthesis).toBe('available')

      expect(report.voiceCount).toBe(2)
    })

    it('counts Spanish voices separately', () => {
      const report = detectSpeechCapability(host({
        speechSynthesis: {
          getVoices: () => [
            { lang: 'es-ES' },
            { lang: 'es-419' },
            { lang: 'en-US' }
          ]
        }
      }))

      expect(report.spanishVoiceCount).toBe(2)
    })

    it('is reachable but unusable when it reports no voices', () => {
      const report = detectSpeechCapability(host({
        speechSynthesis: { getVoices: () => [] }
      }))

      expect(report.synthesis).toBe('reachable-but-unusable')
    })

    it('warns that an empty voice list may still be loading', () => {
      const report = detectSpeechCapability(host({
        speechSynthesis: { getVoices: () => [] }
      }))

      expect(report.notes.join(' '))
        .toMatch(/voiceschanged/)
    })

    it('is reachable but unusable when enumeration throws', () => {
      const report = detectSpeechCapability(host({
        speechSynthesis: {
          getVoices: () => {
            throw new Error('not implemented')
          }
        }
      }))

      expect(report.synthesis).toBe('reachable-but-unusable')

      expect(report.voiceCount).toBe(0)
    })

    it('is reachable but unusable when getVoices is missing', () => {
      const report = detectSpeechCapability(host({
        speechSynthesis: {} as never
      }))

      expect(report.synthesis).toBe('reachable-but-unusable')
    })
  })

  describe('recognition', () => {
    it('prefers the standard constructor', () => {
      const report = detectSpeechCapability(host({
        SpeechRecognition: RecognitionStub,
        webkitSpeechRecognition: RecognitionStub
      }))

      expect(report.recognition).toBe('reachable')

      expect(report.recognitionVendor).toBe('standard')
    })

    it('falls back to the webkit constructor', () => {
      const report = detectSpeechCapability(host({
        webkitSpeechRecognition: RecognitionStub
      }))

      expect(report.recognition).toBe('reachable')

      expect(report.recognitionVendor).toBe('webkit')
    })

    it('is absent when neither constructor exists', () => {
      const report = detectSpeechCapability(host({
        SpeechRecognition: undefined
      }))

      expect(report.recognition).toBe('absent')
    })

    it('never reports recognition as available, only reachable', () => {
      const report = detectSpeechCapability(host({
        SpeechRecognition: RecognitionStub
      }))

      expect(report.recognition).not.toBe('available')

      expect(report.notes.join(' '))
        .toMatch(/start\(\)/)
    })
  })

  it('produces a report that survives JSON round-tripping', () => {
    const report = detectSpeechCapability(host({
      speechSynthesis: {
        getVoices: () => [{ lang: 'es-ES' }]
      },
      SpeechRecognition: RecognitionStub
    }))

    expect(JSON.parse(JSON.stringify(report)))
      .toEqual(report)
  })
})
