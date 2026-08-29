import { describe, expect, it, vi } from 'vitest'

import {
  createWebSpeechRecognition
} from '../../app/services/webSpeechRecognition'
import type {
  RecognitionLike,
  WebSpeechRecognitionHost
} from '../../app/services/webSpeechRecognition'

function fakeRecognition() {
  const instance = {
    lang: '',
    interimResults: false,
    continuous: true,
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn()
  } as unknown as RecognitionLike

  return instance
}

function hostWith(
  instance: RecognitionLike,
  vendor: 'standard' | 'webkit' = 'standard'
): WebSpeechRecognitionHost {
  const constructor = function () {
    return instance
  } as unknown as new () => RecognitionLike

  return vendor === 'standard'
    ? { SpeechRecognition: constructor }
    : { webkitSpeechRecognition: constructor }
}

function result(transcript: string, isFinal: boolean) {
  return {
    results: [
      Object.assign([{ transcript }], { isFinal })
    ]
  }
}

describe('createWebSpeechRecognition', () => {
  it('refuses when there is no constructor, and says a bridge is needed', async () => {
    await expect(createWebSpeechRecognition({}).start())
      .rejects.toThrow(/puente nativo/)
  })

  describe('choosing the engine', () => {
    it('prefers the unprefixed constructor', async () => {
      const instance = fakeRecognition()
      const port = createWebSpeechRecognition(hostWith(instance))

      const session = port.start()

      instance.onstart?.()
      instance.onend?.()
      await session

      expect(instance.start).toHaveBeenCalledTimes(1)
    })

    it('falls back to the webkit constructor', async () => {
      const instance = fakeRecognition()
      const port = createWebSpeechRecognition(
        hostWith(instance, 'webkit')
      )

      const session = port.start()

      instance.onstart?.()
      instance.onend?.()
      await session

      expect(instance.start).toHaveBeenCalledTimes(1)
    })
  })

  it('asks for Spanish and for interim results', async () => {
    const instance = fakeRecognition()
    const port = createWebSpeechRecognition(hostWith(instance))

    const session = port.start()

    expect(instance.lang).toBe('es-ES')
    expect(instance.interimResults).toBe(true)
    // Push-to-talk is one utterance per press, not an open microphone.
    expect(instance.continuous).toBe(false)

    instance.onstart?.()
    instance.onend?.()
    await session
  })

  it('reports the moment the engine takes the microphone', async () => {
    const instance = fakeRecognition()
    const port = createWebSpeechRecognition(hostWith(instance))
    const onStart = vi.fn()

    const session = port.start({ onStart })

    instance.onstart?.()

    expect(onStart).toHaveBeenCalledTimes(1)

    instance.onend?.()
    await session
  })

  it('passes transcripts through with their final flag', async () => {
    const instance = fakeRecognition()
    const port = createWebSpeechRecognition(hostWith(instance))
    const onTranscript = vi.fn()

    const session = port.start({ onTranscript })

    instance.onstart?.()
    instance.onresult?.(result('lee los códigos', false) as never)
    instance.onresult?.(result('lee los códigos', true) as never)

    expect(onTranscript).toHaveBeenNthCalledWith(1, 'lee los códigos', false)
    expect(onTranscript).toHaveBeenNthCalledWith(2, 'lee los códigos', true)

    instance.onend?.()
    await session
  })

  /**
   * The error code is the whole point of the probe, so it travels verbatim.
   * `not-allowed`, `service-not-allowed`, `no-speech` and `network` mean four
   * different things and a paraphrase loses the difference.
   */
  it('rejects with the engine error code, verbatim', async () => {
    const instance = fakeRecognition()
    const port = createWebSpeechRecognition(hostWith(instance))

    const session = port.start()

    instance.onerror?.({ error: 'not-allowed' })

    await expect(session).rejects.toThrow('not-allowed')
  })

  it('settles once, even when end follows error', async () => {
    const instance = fakeRecognition()
    const port = createWebSpeechRecognition(hostWith(instance))

    const session = port.start()

    instance.onerror?.({ error: 'network' })
    instance.onend?.()

    await expect(session).rejects.toThrow('network')
  })

  it('rejects when the engine never opens the microphone', async () => {
    vi.useFakeTimers()

    const instance = fakeRecognition()
    const port = createWebSpeechRecognition(
      hostWith(instance),
      { startTimeoutMs: 5000 }
    )

    const session = port.start()
    const settled = expect(session).rejects.toThrow(/no llegó a abrir/)

    await vi.advanceTimersByTimeAsync(5000)
    await settled

    vi.useRealTimers()
  })

  it('stops the live session', async () => {
    const instance = fakeRecognition()
    const port = createWebSpeechRecognition(hostWith(instance))

    const session = port.start()

    instance.onstart?.()
    port.stop()

    expect(instance.stop).toHaveBeenCalledTimes(1)

    instance.onend?.()
    await session
  })

  it('ignores a stop with nothing running', () => {
    expect(() => createWebSpeechRecognition({}).stop()).not.toThrow()
  })
})
