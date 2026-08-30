import { describe, expect, it, vi } from 'vitest'

import {
  createWebSpeechSynthesis,
  type WebSpeechHost,
  type UtteranceLike
} from '../../app/services/webSpeechSynthesis'

/** A host whose utterances complete on the next tick, like a working engine. */
function workingHost(): WebSpeechHost & { spoken: string[] } {
  const spoken: string[] = []

  return {
    spoken,
    speechSynthesis: {
      getVoices: () => [{ lang: 'es-ES' }],
      speak: (utterance: UtteranceLike) => {
        spoken.push(utterance.text)
        queueMicrotask(() => utterance.onstart?.())
      },
      cancel: vi.fn()
    },
    SpeechSynthesisUtterance: class {
      text: string
      lang = ''
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      onerror: ((event: { error?: string }) => void) | null = null

      constructor(text: string) {
        this.text = text
      }
    }
  }
}

describe('createWebSpeechSynthesis', () => {
  it('speaks the text it is given', async () => {
    const host = workingHost()

    await createWebSpeechSynthesis(host).speak('temperatura alta')

    expect(host.spoken).toEqual(['temperatura alta'])
  })

  it('speaks Spanish, since every string in this app is Spanish', async () => {
    const host = workingHost()
    let lang = ''

    host.speechSynthesis!.speak = (utterance: UtteranceLike) => {
      lang = utterance.lang
      queueMicrotask(() => utterance.onstart?.())
    }

    await createWebSpeechSynthesis(host).speak('hola')

    expect(lang).toBe('es-ES')
  })

  it('rejects with a usable reason when the API is absent', async () => {
    const port = createWebSpeechSynthesis({})

    await expect(port.speak('hola')).rejects.toThrow(/puente nativo/)
  })

  it('rejects when the engine reports an error', async () => {
    const host = workingHost()

    host.speechSynthesis!.speak = (utterance: UtteranceLike) => {
      queueMicrotask(() => utterance.onerror?.({ error: 'synthesis-failed' }))
    }

    await expect(createWebSpeechSynthesis(host).speak('hola'))
      .rejects.toThrow(/synthesis-failed/)
  })

  it('reports the start of audio, which is the proof the engine works', async () => {
    const host = workingHost()
    const onStart = vi.fn()

    host.speechSynthesis!.speak = (utterance: UtteranceLike) => {
      queueMicrotask(() => {
        utterance.onstart?.()
        utterance.onend?.()
      })
    }

    await createWebSpeechSynthesis(host).speak('hola', { onStart })

    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('rejects on timeout when no audio was ever heard', async () => {
    vi.useFakeTimers()

    const host = workingHost()

    host.speechSynthesis!.speak = () => {}

    const pending = createWebSpeechSynthesis(host, { timeoutMs: 5000 })
      .speak('hola')

    const assertion = expect(pending).rejects.toThrow(/no emitió/)

    await vi.advanceTimersByTimeAsync(5000)
    await assertion

    vi.useRealTimers()
  })

  /**
   * Android WebViews drop `onend`. Once audio has been heard the engine has
   * proven itself, so a missing end event must not retract that.
   */
  it('resolves immediately when audio starts even if it never ends', async () => {
    const host = workingHost()

    host.speechSynthesis!.speak = (utterance: UtteranceLike) => {
      utterance.onstart?.()
    }

    await expect(createWebSpeechSynthesis(host, { timeoutMs: 5000 }).speak('hola'))
      .resolves.toBeUndefined()
  })

  it('reports zero voices as the cause rather than a bare failure', async () => {
    const host = workingHost()

    host.speechSynthesis!.getVoices = () => []
    host.speechSynthesis!.speak = (utterance: UtteranceLike) => {
      queueMicrotask(() => utterance.onerror?.({}))
    }

    await expect(createWebSpeechSynthesis(host).speak('hola'))
      .rejects.toThrow(/voces/)
  })

  it('cancels through to the engine', () => {
    const host = workingHost()

    createWebSpeechSynthesis(host).cancel()

    expect(host.speechSynthesis!.cancel).toHaveBeenCalledTimes(1)
  })

  it('survives cancelling when there is no engine at all', () => {
    expect(() => createWebSpeechSynthesis({}).cancel()).not.toThrow()
  })
})
