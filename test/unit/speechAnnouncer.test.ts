import { describe, expect, it, vi } from 'vitest'

import {
  SpeechAnnouncer,
  type SpeechSynthesisPort
} from '../../core/speech/SpeechAnnouncer'

function port(
  overrides: Partial<SpeechSynthesisPort> = {}
): SpeechSynthesisPort {
  return {
    speak: vi.fn(async () => {}),
    cancel: vi.fn(),
    ...overrides
  }
}

describe('SpeechAnnouncer', () => {
  it('starts off, because audio is never the default', () => {
    expect(new SpeechAnnouncer(port()).state).toBe('off')
  })

  describe('enabling', () => {
    it('proves the engine by actually speaking, not by asking', async () => {
      const speak = vi.fn(async () => {})

      await new SpeechAnnouncer(port({ speak })).enable()

      expect(speak).toHaveBeenCalledTimes(1)
    })

    it('turns on when the confirmation is spoken', async () => {
      const announcer = new SpeechAnnouncer(port())

      await announcer.enable()

      expect(announcer.state).toBe('on')
    })

    it('becomes unavailable when speaking fails', async () => {
      const announcer = new SpeechAnnouncer(port({
        speak: vi.fn(async () => {
          throw new Error('no voices installed')
        })
      }))

      await announcer.enable()

      expect(announcer.state).toBe('unavailable')
    })

    it('keeps the failure reason for the user to read', async () => {
      const announcer = new SpeechAnnouncer(port({
        speak: vi.fn(async () => {
          throw new Error('no voices installed')
        })
      }))

      await announcer.enable()

      expect(announcer.unavailableReason)
        .toContain('no voices installed')
    })

    it('can be retried after a failure, because the user may install a voice', async () => {
      const speak = vi.fn()
        .mockRejectedValueOnce(new Error('no voices installed'))
        .mockResolvedValueOnce(undefined)

      const announcer = new SpeechAnnouncer(port({ speak }))

      await announcer.enable()
      await announcer.enable()

      expect(announcer.state).toBe('on')

      expect(announcer.unavailableReason).toBeNull()
    })
  })

  describe('announcing', () => {
    it('says nothing while off', async () => {
      const speak = vi.fn(async () => {})

      await new SpeechAnnouncer(port({ speak })).announce('temperatura alta')

      expect(speak).not.toHaveBeenCalled()
    })

    it('speaks once enabled', async () => {
      const speak = vi.fn(async () => {})
      const announcer = new SpeechAnnouncer(port({ speak }))

      await announcer.enable()
      await announcer.announce('temperatura alta')

      expect(speak).toHaveBeenLastCalledWith('temperatura alta')
    })

    it('says nothing while unavailable', async () => {
      const speak = vi.fn(async () => {
        throw new Error('nope')
      })

      const announcer = new SpeechAnnouncer(port({ speak }))

      await announcer.enable()
      speak.mockClear()

      await announcer.announce('temperatura alta')

      expect(speak).not.toHaveBeenCalled()
    })

    it('never lets a speech failure reach the caller', async () => {
      const announcer = new SpeechAnnouncer(port())

      await announcer.enable()

      announcer.port.speak = vi.fn(async () => {
        throw new Error('engine died mid-drive')
      })

      await expect(announcer.announce('algo')).resolves.toBeUndefined()
    })

    it('degrades to unavailable when speaking fails later', async () => {
      const announcer = new SpeechAnnouncer(port())

      await announcer.enable()

      announcer.port.speak = vi.fn(async () => {
        throw new Error('engine died mid-drive')
      })

      await announcer.announce('algo')

      expect(announcer.state).toBe('unavailable')
    })
  })

  describe('disabling', () => {
    it('cancels whatever is being said', async () => {
      const cancel = vi.fn()
      const announcer = new SpeechAnnouncer(port({ cancel }))

      await announcer.enable()
      announcer.disable()

      expect(cancel).toHaveBeenCalledTimes(1)

      expect(announcer.state).toBe('off')
    })

    it('clears a previous unavailable reason', async () => {
      const announcer = new SpeechAnnouncer(port({
        speak: vi.fn(async () => {
          throw new Error('nope')
        })
      }))

      await announcer.enable()
      announcer.disable()

      expect(announcer.state).toBe('off')

      expect(announcer.unavailableReason).toBeNull()
    })
  })

  describe('toggle', () => {
    it('turns on from off', async () => {
      const announcer = new SpeechAnnouncer(port())

      await announcer.toggle()

      expect(announcer.state).toBe('on')
    })

    it('turns off from on', async () => {
      const announcer = new SpeechAnnouncer(port())

      await announcer.toggle()
      await announcer.toggle()

      expect(announcer.state).toBe('off')
    })

    it('retries from unavailable rather than staying stuck', async () => {
      const speak = vi.fn()
        .mockRejectedValueOnce(new Error('nope'))
        .mockResolvedValueOnce(undefined)

      const announcer = new SpeechAnnouncer(port({ speak }))

      await announcer.toggle()
      await announcer.toggle()

      expect(announcer.state).toBe('on')
    })
  })
})
