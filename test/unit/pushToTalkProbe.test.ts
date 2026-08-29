// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PushToTalkProbe from '../../app/components/PushToTalkProbe.vue'
import type { ListenerState } from '../../core/speech/SpeechListener'

const stubs = {
  UCard: { template: '<div><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  /**
   * No `emits`: the probe listens for native pointer events, so they have to
   * fall through to the real element rather than be swallowed as component
   * emits.
   */
  UButton: { template: '<button type="button"><slot /></button>' }
}

function render(props: {
  state?: ListenerState
  transcript?: string
  transcriptIsFinal?: boolean
  reason?: string | null
} = {}) {
  return mount(PushToTalkProbe, {
    props: {
      state: 'idle',
      transcript: '',
      transcriptIsFinal: false,
      reason: null,
      ...props
    },
    global: { stubs }
  })
}

describe('PushToTalkProbe', () => {
  describe('what it is doing right now', () => {
    it('invites a press when idle', () => {
      expect(render().text()).toContain('Mantén pulsado')
    })

    it('says it is opening the microphone while starting', () => {
      expect(render({ state: 'starting' }).text())
        .toContain('Abriendo el micrófono')
    })

    it('says it is listening once the engine took the microphone', () => {
      expect(render({ state: 'listening' }).text()).toContain('Escuchando')
    })
  })

  describe('what it heard', () => {
    it('shows the raw transcript', () => {
      expect(render({
        state: 'listening',
        transcript: 'lee los códigos'
      }).text()).toContain('lee los códigos')
    })

    it('marks a result still being revised', () => {
      expect(render({
        state: 'listening',
        transcript: 'lee los',
        transcriptIsFinal: false
      }).text()).toContain('provisional')
    })

    it('marks a settled result', () => {
      expect(render({
        state: 'idle',
        transcript: 'lee los códigos',
        transcriptIsFinal: true
      }).text()).toContain('definitivo')
    })
  })

  /**
   * The engine's code is the finding. A gloss helps the person holding the
   * phone, but it is shown BESIDE the code, never instead of it — the four
   * codes mean four different things and only the code survives being typed
   * into a report.
   */
  describe('a failure', () => {
    it('shows the code verbatim', () => {
      expect(render({ state: 'unavailable', reason: 'not-allowed' }).text())
        .toContain('not-allowed')
    })

    it('explains a code it knows, without hiding it', () => {
      const text = render({
        state: 'unavailable',
        reason: 'service-not-allowed'
      }).text()

      expect(text).toContain('service-not-allowed')
      expect(text).toContain('no ofrece servicio de reconocimiento')
    })

    it('shows an unknown reason as it came', () => {
      const text = render({
        state: 'unavailable',
        reason: 'algo que nadie ha visto antes'
      }).text()

      expect(text).toContain('algo que nadie ha visto antes')
    })
  })

  describe('press and hold', () => {
    it('presses on pointer down', async () => {
      const wrapper = render()

      await wrapper.find('button').trigger('pointerdown')

      expect(wrapper.emitted('press')).toHaveLength(1)
    })

    it('releases on pointer up', async () => {
      const wrapper = render({ state: 'listening' })

      await wrapper.find('button').trigger('pointerup')

      expect(wrapper.emitted('release')).toHaveLength(1)
    })

    /**
     * A finger that slides off the button must end the session. Otherwise
     * the microphone stays open with nothing on screen saying so.
     */
    it('releases when the finger leaves the button', async () => {
      const wrapper = render({ state: 'listening' })

      await wrapper.find('button').trigger('pointerleave')

      expect(wrapper.emitted('release')).toHaveLength(1)
    })

    it('releases when the gesture is cancelled', async () => {
      const wrapper = render({ state: 'listening' })

      await wrapper.find('button').trigger('pointercancel')

      expect(wrapper.emitted('release')).toHaveLength(1)
    })
  })

  it('says plainly that this is a probe, not the feature', () => {
    expect(render().text()).toContain('no ejecuta ningún comando')
  })
})
