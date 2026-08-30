// @vitest-environment nuxt
import { mount } from '@vue/test-utils'
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest'

import SpeechToggleButton from '../../app/components/SpeechToggleButton.vue'
import { __resetSpeechAnnouncer } from '../../app/composables/useSpeechAnnouncer'

/** Installs a speech engine on `window` that starts every utterance. */
function installWorkingEngine(): void {
  Object.assign(window, {
    speechSynthesis: {
      getVoices: () => [{ lang: 'es-ES' }],
      speak: (utterance: { onstart: (() => void) | null }) => {
        queueMicrotask(() => utterance.onstart?.())
      },
      cancel: () => {}
    },
    SpeechSynthesisUtterance: class {
      text: string
      lang = ''
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null

      constructor(text: string) {
        this.text = text
      }
    }
  })
}

/**
 * Settles the click handler's promise chain before asserting.
 *
 * `trigger('click')` waits one tick, which is not enough: enabling awaits an
 * utterance that completes on a later microtask, and only then does the state
 * sync and the button re-render.
 */
async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

/** An engine that accepts the utterance but never makes a sound. */
function installSilentEngine(): void {
  installWorkingEngine()

  Object.assign(window.speechSynthesis as object, { speak: () => {} })
}

function removeEngine(): void {
  Reflect.deleteProperty(window, 'speechSynthesis')
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance')
}

afterEach(() => {
  __resetSpeechAnnouncer()
  removeEngine()
})

describe('SpeechToggleButton', () => {
  it('mounts as a real button rather than nothing', () => {
    const wrapper = mount(SpeechToggleButton)

    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('starts silent, because audio must never begin on its own in a car', () => {
    const wrapper = mount(SpeechToggleButton)

    expect(wrapper.get('button').attributes('aria-pressed'))
      .toBe('false')

    expect(wrapper.get('button').attributes('aria-label'))
      .toBe('Activar la voz')
  })

  it('turns on when the engine actually speaks', async () => {
    installWorkingEngine()

    const wrapper = mount(SpeechToggleButton)

    await wrapper.get('button').trigger('click')
    await flush()

    expect(wrapper.get('button').attributes('aria-pressed'))
      .toBe('true')

    expect(wrapper.get('button').attributes('aria-label'))
      .toBe('Silenciar la voz')
  })

  it('silences again on a second press', async () => {
    installWorkingEngine()

    const wrapper = mount(SpeechToggleButton)

    await wrapper.get('button').trigger('click')
    await flush()
    await wrapper.get('button').trigger('click')
    await flush()

    expect(wrapper.get('button').attributes('aria-pressed'))
      .toBe('false')
  })

  /**
   * The regression this state exists for: the button used to sit unchanged
   * until the engine finished the whole confirmation phrase, so pressing it
   * looked like nothing had happened for seconds while the phone was audibly
   * talking.
   */
  describe('the gap between the press and the first sound', () => {
    it('answers the press immediately instead of looking dead', async () => {
      installSilentEngine()

      const wrapper = mount(SpeechToggleButton)

      await wrapper.get('button').trigger('click')
      await flush()

      expect(wrapper.get('button').attributes('aria-label'))
        .toBe('Activando la voz…')
    })

    it('stays pressable so a stuck engine can be abandoned', async () => {
      installSilentEngine()

      const wrapper = mount(SpeechToggleButton)

      await wrapper.get('button').trigger('click')
      await flush()

      expect(wrapper.get('button').attributes('disabled'))
        .toBeUndefined()

      await wrapper.get('button').trigger('click')
      await flush()

      expect(wrapper.get('button').attributes('aria-label'))
        .toBe('Activar la voz')
    })

    it('does not pulse yet, because nothing is proven', async () => {
      installSilentEngine()

      const wrapper = mount(SpeechToggleButton)

      await wrapper.get('button').trigger('click')
      await flush()

      expect(wrapper.find('[data-testid="speech-pulse"]').exists())
        .toBe(false)
    })
  })

  it('wears a voice icon, not a media-player one, while speaking', async () => {
    installWorkingEngine()

    const wrapper = mount(SpeechToggleButton)

    await wrapper.get('button').trigger('click')
    await flush()

    expect(wrapper.html()).toContain('i-lucide:audio-lines')
  })

  it('reads as muted while off', () => {
    const wrapper = mount(SpeechToggleButton)

    expect(wrapper.html()).toContain('i-lucide:volume-x')
  })

  describe('the active pulse', () => {
    it('is absent while off, so a still button means silence', () => {
      const wrapper = mount(SpeechToggleButton)

      expect(wrapper.find('[data-testid="speech-pulse"]').exists())
        .toBe(false)
    })

    /**
     * The halo shipped invisible once: `inset-0` made it exactly the size of
     * an opaque button that paints on top of it, so it existed in the DOM and
     * showed nothing. Presence is not visibility — it has to reach past the
     * button's edge to be seen at all.
     */
    it('extends past the button instead of hiding underneath it', async () => {
      installWorkingEngine()

      const wrapper = mount(SpeechToggleButton)

      await wrapper.get('button').trigger('click')
      await flush()

      const classes = wrapper.get('[data-testid="speech-pulse"]').classes()

      expect(classes.some(name => name.startsWith('-inset-')))
        .toBe(true)

      expect(classes).not.toContain('inset-0')
    })

    it('appears once the voice is on', async () => {
      installWorkingEngine()

      const wrapper = mount(SpeechToggleButton)

      await wrapper.get('button').trigger('click')
      await flush()

      expect(wrapper.find('[data-testid="speech-pulse"]').exists())
        .toBe(true)
    })

    it('is absent while unavailable, which is not an active state', async () => {
      const wrapper = mount(SpeechToggleButton)

      await wrapper.get('button').trigger('click')
      await flush()

      expect(wrapper.find('[data-testid="speech-pulse"]').exists())
        .toBe(false)
    })

    /**
     * Driving. A halo that cannot be switched off is a distraction, and it
     * must never be the only thing carrying the state -- colour and the
     * icon already do that on their own.
     */
    it('stops animating under prefers-reduced-motion', async () => {
      installWorkingEngine()

      const wrapper = mount(SpeechToggleButton)

      await wrapper.get('button').trigger('click')
      await flush()

      expect(wrapper.get('[data-testid="speech-pulse"]').classes())
        .toContain('motion-reduce:animate-none')
    })
  })

  /**
   * The case ADR-012 refuses to assume away: no Web Speech engine in this
   * WebView. The button must say so and stay pressable, not silently claim
   * to have turned on.
   */
  it('reports unavailable when there is no engine, and invites a retry', async () => {
    const wrapper = mount(SpeechToggleButton)

    await wrapper.get('button').trigger('click')
    await flush()

    expect(wrapper.get('button').attributes('aria-pressed'))
      .toBe('false')

    expect(wrapper.get('button').attributes('aria-label'))
      .toBe('La voz no está disponible. Reintentar')
  })
})
