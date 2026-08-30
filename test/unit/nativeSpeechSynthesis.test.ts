import { describe, expect, it, vi } from 'vitest'

import {
  createNativeSpeechSynthesis,
  isNativeAndroidSpeechPlatform,
  type NativeTextToSpeechPlugin
} from '../../app/services/nativeSpeechSynthesis'

describe('createNativeSpeechSynthesis', () => {
  it('speaks through the native plugin and reports start when native onStart proof resolves', async () => {
    const onStart = vi.fn()
    const plugin: NativeTextToSpeechPlugin = {
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined)
    }

    await createNativeSpeechSynthesis(plugin).speak('temperatura alta', { onStart })

    expect(plugin.speak).toHaveBeenCalledWith({ text: 'temperatura alta' })
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('preserves useful native Spanish failure reasons', async () => {
    const plugin: NativeTextToSpeechPlugin = {
      speak: vi.fn().mockRejectedValue(new Error('Faltan datos de voz en español.')),
      cancel: vi.fn().mockResolvedValue(undefined)
    }

    await expect(createNativeSpeechSynthesis(plugin).speak('hola'))
      .rejects.toThrow('Faltan datos de voz en español.')
  })

  it('uses a Spanish fallback reason for non-error native failures', async () => {
    const plugin: NativeTextToSpeechPlugin = {
      speak: vi.fn().mockRejectedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined)
    }

    await expect(createNativeSpeechSynthesis(plugin).speak('hola'))
      .rejects.toThrow('El motor de voz nativo no pudo hablar.')
  })

  it('cancels through to the native plugin without exposing async errors', () => {
    const plugin: NativeTextToSpeechPlugin = {
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockRejectedValue(new Error('already stopped'))
    }

    expect(() => createNativeSpeechSynthesis(plugin).cancel()).not.toThrow()
    expect(plugin.cancel).toHaveBeenCalledTimes(1)
  })
})

describe('isNativeAndroidSpeechPlatform', () => {
  it('accepts only the native Android Capacitor platform', () => {
    expect(isNativeAndroidSpeechPlatform({
      isNativePlatform: () => true,
      getPlatform: () => 'android'
    })).toBe(true)

    expect(isNativeAndroidSpeechPlatform({
      isNativePlatform: () => false,
      getPlatform: () => 'android'
    })).toBe(false)

    expect(isNativeAndroidSpeechPlatform({
      isNativePlatform: () => true,
      getPlatform: () => 'web'
    })).toBe(false)
  })
})
