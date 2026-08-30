import { Capacitor } from '@capacitor/core'

import type { SpeechSynthesisPort } from '~~/core/speech/SpeechAnnouncer'
import {
  createNativeSpeechSynthesis,
  isNativeAndroidSpeechPlatform,
  type NativeSpeechPlatform,
  type NativeTextToSpeechPlugin
} from '~/services/nativeSpeechSynthesis'
import {
  createWebSpeechSynthesis,
  type WebSpeechHost,
  type WebSpeechOptions
} from '~/services/webSpeechSynthesis'

export interface SpeechSynthesisPortOptions {
  platform?: NativeSpeechPlatform
  nativePlugin?: NativeTextToSpeechPlugin
  webOptions?: WebSpeechOptions
}

export function createSpeechSynthesisPort(
  host: WebSpeechHost,
  options: SpeechSynthesisPortOptions = {}
): SpeechSynthesisPort {
  if (isNativeAndroidSpeechPlatform(options.platform ?? Capacitor)) {
    return createNativeSpeechSynthesis(options.nativePlugin)
  }

  return createWebSpeechSynthesis(host, options.webOptions)
}
