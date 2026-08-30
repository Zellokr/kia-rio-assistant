import {
  Capacitor,
  registerPlugin
} from '@capacitor/core'

import type {
  SpeakHooks,
  SpeechSynthesisPort
} from '~~/core/speech/SpeechAnnouncer'

export interface NativeTextToSpeechPlugin {
  speak(options: { text: string }): Promise<void>
  cancel(): Promise<void>
}

export interface NativeSpeechPlatform {
  isNativePlatform: () => boolean
  getPlatform: () => string
}

const NativeTextToSpeech = registerPlugin<NativeTextToSpeechPlugin>(
  'NativeTextToSpeech'
)

export function isNativeAndroidSpeechPlatform(
  platform: NativeSpeechPlatform = Capacitor
): boolean {
  return platform.isNativePlatform() && platform.getPlatform() === 'android'
}

/**
 * Capacitor-facing Android TTS adapter.
 *
 * The native plugin resolves `speak` from Android's
 * `UtteranceProgressListener.onStart`, which is the closest platform proof that
 * audio has begun. This wrapper then forwards the same proof to
 * `SpeechAnnouncer` through `onStart`.
 */
export function createNativeSpeechSynthesis(
  plugin: NativeTextToSpeechPlugin = NativeTextToSpeech
): SpeechSynthesisPort {
  return {
    async speak(text: string, hooks?: SpeakHooks): Promise<void> {
      try {
        await plugin.speak({ text })
        hooks?.onStart?.()
      } catch (error) {
        throw new Error(describeNativeSpeechError(error), { cause: error })
      }
    },

    cancel(): void {
      void plugin.cancel().catch(() => undefined)
    }
  }
}

function describeNativeSpeechError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return 'El motor de voz nativo no pudo hablar.'
}
