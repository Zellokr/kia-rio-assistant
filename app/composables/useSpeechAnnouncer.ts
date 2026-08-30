import { readonly, ref, type Ref } from 'vue'

import {
  SpeechAnnouncer,
  type AnnouncerState
} from '~~/core/speech/SpeechAnnouncer'
import { createSpeechSynthesisPort } from '~/services/speechSynthesisPort'

/**
 * One announcer for the whole app.
 *
 * The toggle lives in the layout and is on screen in every view, so its state
 * cannot belong to a view. It is a module singleton rather than `useState`
 * because a `SpeechAnnouncer` is a live object wrapping the platform engine,
 * not serialisable state to be handed from a server render to the client.
 *
 * The announcer itself is created lazily on first use, since `window` does not
 * exist while `nuxt generate` prerenders these pages.
 */

const state = ref<AnnouncerState>('off')
const unavailableReason = ref<string | null>(null)

let announcer: SpeechAnnouncer | null = null

function resolveAnnouncer(): SpeechAnnouncer | null {
  if (announcer) {
    return announcer
  }

  if (typeof window === 'undefined') {
    return null
  }

  /**
   * Subscribed rather than polled after the await.
   *
   * Syncing once the promise settled meant the button did not move until the
   * engine finished the whole confirmation phrase — seconds of a dead control
   * while the phone was audibly talking. Every transition now lands the
   * moment the announcer makes it, including `starting`.
   */
  const instance: SpeechAnnouncer = new SpeechAnnouncer(
    createSpeechSynthesisPort(window as never),
    () => {
      state.value = instance.state
      unavailableReason.value = instance.unavailableReason
    }
  )

  announcer = instance

  return announcer
}

export interface SpeechAnnouncerHandle {
  readonly state: Readonly<Ref<AnnouncerState>>
  readonly unavailableReason: Readonly<Ref<string | null>>
  toggle: () => Promise<void>
  announce: (text: string) => Promise<void>
}

export function useSpeechAnnouncer(): SpeechAnnouncerHandle {
  return {
    state: readonly(state),
    unavailableReason: readonly(unavailableReason),

    async toggle(): Promise<void> {
      const instance = resolveAnnouncer()

      if (!instance) {
        return
      }

      await instance.toggle()
    },

    /**
     * Never throws and never blocks the caller: a diagnostic that fails
     * because the phone lost its voice is worse than a silent one.
     */
    async announce(text: string): Promise<void> {
      const instance = resolveAnnouncer()

      if (!instance) {
        return
      }

      await instance.announce(text)
    }
  }
}

/** Test seam — resets the module singleton between cases. */
export function __resetSpeechAnnouncer(): void {
  announcer = null
  state.value = 'off'
  unavailableReason.value = null
}
