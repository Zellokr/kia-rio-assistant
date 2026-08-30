import { describe, expect, it, vi } from 'vitest'

import { createSpeechSynthesisPort } from '../../app/services/speechSynthesisPort'
import type { NativeTextToSpeechPlugin } from '../../app/services/nativeSpeechSynthesis'
import type { WebSpeechHost, UtteranceLike } from '../../app/services/webSpeechSynthesis'

function webHost(): WebSpeechHost & { spoken: string[] } {
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

describe('createSpeechSynthesisPort', () => {
  it('uses the native Android plugin inside a Capacitor Android shell', async () => {
    const host = webHost()
    const nativePlugin: NativeTextToSpeechPlugin = {
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined)
    }

    await createSpeechSynthesisPort(host, {
      platform: {
        isNativePlatform: () => true,
        getPlatform: () => 'android'
      },
      nativePlugin
    }).speak('voz nativa')

    expect(nativePlugin.speak).toHaveBeenCalledWith({ text: 'voz nativa' })
    expect(host.spoken).toEqual([])
  })

  it('falls back to Web Speech outside native Android', async () => {
    const host = webHost()
    const nativePlugin: NativeTextToSpeechPlugin = {
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined)
    }

    await createSpeechSynthesisPort(host, {
      platform: {
        isNativePlatform: () => false,
        getPlatform: () => 'web'
      },
      nativePlugin
    }).speak('voz web')

    expect(host.spoken).toEqual(['voz web'])
    expect(nativePlugin.speak).not.toHaveBeenCalled()
  })

  it('falls back to Web Speech on non-Android native platforms', async () => {
    const host = webHost()
    const nativePlugin: NativeTextToSpeechPlugin = {
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined)
    }

    await createSpeechSynthesisPort(host, {
      platform: {
        isNativePlatform: () => true,
        getPlatform: () => 'ios'
      },
      nativePlugin
    }).speak('voz web')

    expect(host.spoken).toEqual(['voz web'])
    expect(nativePlugin.speak).not.toHaveBeenCalled()
  })
})
