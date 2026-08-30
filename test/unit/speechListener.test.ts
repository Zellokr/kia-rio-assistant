import { describe, expect, it, vi } from 'vitest'

import { SpeechListener } from '../../core/speech/SpeechListener'
import type {
  RecognitionHooks,
  SpeechRecognitionPort
} from '../../core/speech/SpeechListener'

/**
 * A port under the test's control: nothing settles until the test says so,
 * which is the only way to assert on the states in between.
 */
function fakePort() {
  let hooks: RecognitionHooks | undefined
  let settle: { resolve: () => void, reject: (error: unknown) => void }

  const port: SpeechRecognitionPort = {
    start(given) {
      hooks = given

      return new Promise<void>((resolve, reject) => {
        settle = { resolve, reject }
      })
    },
    stop: vi.fn()
  }

  return {
    port,
    audioStarts: () => hooks?.onStart?.(),
    hears: (text: string, isFinal: boolean) =>
      hooks?.onTranscript?.(text, isFinal),
    ends: () => settle.resolve(),
    fails: (error: unknown) => settle.reject(error)
  }
}

describe('SpeechListener', () => {
  it('starts idle and claims nothing', () => {
    const listener = new SpeechListener(fakePort().port)

    expect(listener.state).toBe('idle')
    expect(listener.transcript).toBe('')
    expect(listener.unavailableReason).toBeNull()
  })

  /**
   * The same rule the announcer applies to speaking: the engine's own signal
   * is the proof, not the call returning. `starting` is the honest gap
   * between the press and the microphone actually opening.
   */
  describe('the proof is that the engine starts', () => {
    it('shows starting until the engine reports audio', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const session = listener.listen()

      expect(listener.state).toBe('starting')

      engine.audioStarts()

      expect(listener.state).toBe('listening')

      engine.ends()
      await session
    })

    it('returns to idle when the session ends normally', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const session = listener.listen()

      engine.audioStarts()
      engine.ends()

      await session

      expect(listener.state).toBe('idle')
    })
  })

  describe('what it heard', () => {
    it('records an interim transcript', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const session = listener.listen()

      engine.audioStarts()
      engine.hears('lee los códigos', false)

      expect(listener.transcript).toBe('lee los códigos')
      expect(listener.transcriptIsFinal).toBe(false)

      engine.ends()
      await session
    })

    it('marks a final transcript as final', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const session = listener.listen()

      engine.audioStarts()
      engine.hears('lee los códigos', true)

      expect(listener.transcriptIsFinal).toBe(true)

      engine.ends()
      await session
    })

    it('clears the previous transcript when a new session starts', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const first = listener.listen()

      engine.audioStarts()
      engine.hears('temperatura', true)
      engine.ends()
      await first

      const second = listener.listen()

      expect(listener.transcript).toBe('')

      engine.ends()
      await second
    })
  })

  /**
   * This is a probe. Every failure the engine reports is the finding, so it
   * surfaces verbatim — including one that arrives after the microphone
   * opened, which is where `no-speech` and `network` live.
   */
  describe('failures are the result', () => {
    it('reports a failure before any audio, verbatim', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const session = listener.listen()

      engine.fails(new Error('not-allowed'))

      await session

      expect(listener.state).toBe('unavailable')
      expect(listener.unavailableReason).toBe('not-allowed')
    })

    it('reports a failure after the microphone opened', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const session = listener.listen()

      engine.audioStarts()
      engine.fails(new Error('no-speech'))

      await session

      expect(listener.state).toBe('unavailable')
      expect(listener.unavailableReason).toBe('no-speech')
    })

    it('never throws at the caller', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const session = listener.listen()

      engine.fails('un rechazo que no es un Error')

      await expect(session).resolves.toBeUndefined()
      expect(listener.unavailableReason).toBe('un rechazo que no es un Error')
    })

    it('clears a stale failure when asked to listen again', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const first = listener.listen()

      engine.fails(new Error('not-allowed'))
      await first

      const second = listener.listen()

      expect(listener.state).toBe('starting')
      expect(listener.unavailableReason).toBeNull()

      engine.ends()
      await second
    })
  })

  describe('stopping', () => {
    it('asks the engine to stop and goes idle', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const session = listener.listen()

      engine.audioStarts()
      listener.stop()

      expect(engine.port.stop).toHaveBeenCalledTimes(1)
      expect(listener.state).toBe('idle')

      engine.ends()
      await session
    })

    it('keeps a final transcript that arrives after the button is released', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const session = listener.listen()

      engine.audioStarts()
      listener.stop()
      engine.hears('temperatura', true)
      engine.ends()
      await session

      expect(listener.transcript).toBe('temperatura')
      expect(listener.transcriptIsFinal).toBe(true)
      expect(listener.state).toBe('idle')
    })

    /**
     * The release of the button and the engine's own end event race. The
     * late one must not overwrite the state the newer one already set.
     */
    it('does not let a late failure overwrite a newer session', async () => {
      const engine = fakePort()
      const listener = new SpeechListener(engine.port)

      const first = listener.listen()

      listener.stop()

      engine.fails(new Error('aborted'))
      await first

      expect(listener.state).toBe('idle')
      expect(listener.unavailableReason).toBeNull()
    })
  })

  it('publishes every transition', async () => {
    const engine = fakePort()
    const onChange = vi.fn()
    const listener = new SpeechListener(engine.port, onChange)

    const session = listener.listen()

    engine.audioStarts()
    engine.hears('estado', true)
    engine.ends()

    await session

    // starting, listening, transcript, idle
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(4)
  })
})
