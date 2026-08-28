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

/** Installs a speech engine on `window` that completes every utterance. */
function installWorkingEngine(): void {
  Object.assign(window, {
    speechSynthesis: {
      getVoices: () => [{ lang: 'es-ES' }],
      speak: (utterance: { onend: (() => void) | null }) => {
        queueMicrotask(() => utterance.onend?.())
      },
      cancel: () => {}
    },
    SpeechSynthesisUtterance: class {
      text: string
      lang = ''
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
