// @vitest-environment nuxt
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AssistantCommandBar from '../../app/components/AssistantCommandBar.vue'
import type { ListenerState } from '../../core/speech/SpeechListener'

const speechControls = vi.hoisted(() => ({
  press: vi.fn(),
  release: vi.fn(),
  state: undefined as unknown as ReturnType<typeof ref<ListenerState>>,
  transcript: undefined as unknown as ReturnType<typeof ref<string>>,
  transcriptIsFinal: undefined as unknown as ReturnType<typeof ref<boolean>>,
  reason: undefined as unknown as ReturnType<typeof ref<string | null>>
}))

vi.mock('~/composables/useSpeechListener', () => ({
  useSpeechListener: () => ({
    state: speechControls.state,
    transcript: speechControls.transcript,
    transcriptIsFinal: speechControls.transcriptIsFinal,
    reason: speechControls.reason,
    press: speechControls.press,
    release: speechControls.release
  })
}))

function resetSpeech(): void {
  speechControls.press.mockReset()
  speechControls.release.mockReset()
  speechControls.state = ref<ListenerState>('idle')
  speechControls.transcript = ref('')
  speechControls.transcriptIsFinal = ref(false)
  speechControls.reason = ref<string | null>(null)
}

function openBar(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('[data-testid="assistant-open"]').trigger('click')
}

async function submit(
  wrapper: ReturnType<typeof mount>,
  text: string
): Promise<void> {
  await openBar(wrapper)
  await wrapper.get('input').setValue(text)
  await wrapper.get('form').trigger('submit')
}

describe('AssistantCommandBar', () => {
  beforeEach(() => {
    resetSpeech()
  })

  it('mounts as a real control rather than nothing', () => {
    const wrapper = mount(AssistantCommandBar)

    expect(wrapper.find('[data-testid="assistant-open"]').exists())
      .toBe(true)
  })

  it('starts collapsed, so it never covers the app unasked', () => {
    const wrapper = mount(AssistantCommandBar)

    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('reveals the text field when opened', async () => {
    const wrapper = mount(AssistantCommandBar)

    await openBar(wrapper)

    expect(wrapper.find('input').exists()).toBe(true)
  })

  describe('submitting text', () => {
    it('emits the recognised command', async () => {
      const wrapper = mount(AssistantCommandBar)

      await submit(wrapper, 'estado')

      expect(wrapper.emitted('command')?.[0]).toEqual(['status'])
    })

    it('accepts a sentence, not just the bare keyword', async () => {
      const wrapper = mount(AssistantCommandBar)

      await submit(wrapper, 'dime la temperatura del motor')

      expect(wrapper.emitted('command')?.[0]).toEqual(['temperature'])
    })

    it('closes itself once a command is understood', async () => {
      const wrapper = mount(AssistantCommandBar)

      await submit(wrapper, 'estado')

      expect(wrapper.find('input').exists()).toBe(false)
    })

    /**
     * Silence still beats a guess for deterministic commands, but an open
     * question now has somewhere useful to go: the local assistant answer path.
     */
    it('emits unrecognised text as an assistant query instead of guessing', async () => {
      const wrapper = mount(AssistantCommandBar)

      await submit(wrapper, 'por que suena raro el motor')

      expect(wrapper.emitted('command')).toBeUndefined()
      expect(wrapper.emitted('query')?.[0]).toEqual([
        { text: 'por que suena raro el motor', source: 'text' }
      ])
    })

    it('closes once unrecognised text is sent to the assistant', async () => {
      const wrapper = mount(AssistantCommandBar)

      await submit(wrapper, 'por que suena raro el motor')

      expect(wrapper.find('input').exists()).toBe(false)
    })

    /**
     * §11 lists "Guardar nota" but nothing stores one — notes are Fase 4
     * maintenance records. Saying so is the honest answer; emitting a
     * command nobody handles would look like it worked.
     */
    it('refuses a command the app cannot carry out yet', async () => {
      const wrapper = mount(AssistantCommandBar)

      await submit(wrapper, 'guardar nota')

      expect(wrapper.emitted('command')).toBeUndefined()

      expect(wrapper.text()).toContain('todavía')
    })

    it('ignores an empty submission', async () => {
      const wrapper = mount(AssistantCommandBar)

      await submit(wrapper, '   ')

      expect(wrapper.emitted('command')).toBeUndefined()
    })
  })

  describe('speech input', () => {
    it('emits temperature from a final transcript', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)

      speechControls.transcript.value = 'temperatura'
      speechControls.transcriptIsFinal.value = true
      await nextTick()

      expect(wrapper.emitted('command')?.[0]).toEqual(['temperature'])
    })

    it('does not execute interim transcripts', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)

      speechControls.transcript.value = 'temperatura'
      speechControls.transcriptIsFinal.value = false
      await nextTick()

      expect(wrapper.emitted('command')).toBeUndefined()
    })

    it('does not execute the same final transcript twice in one session', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)

      speechControls.transcript.value = 'temperatura'
      speechControls.transcriptIsFinal.value = true
      await nextTick()

      speechControls.state.value = 'idle'
      await nextTick()

      speechControls.transcript.value = 'temperatura '
      await nextTick()

      expect(wrapper.emitted('command')).toHaveLength(1)
    })

    it('shows feedback instead of emitting for unsupported speech', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)

      speechControls.transcript.value = 'guardar nota'
      speechControls.transcriptIsFinal.value = true
      await nextTick()

      expect(wrapper.emitted('command')).toBeUndefined()
      expect(wrapper.text()).toContain('todavía')
    })

    it('emits unrecognised speech as an assistant query instead of guessing', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)

      speechControls.transcript.value = 'abre la ventana'
      speechControls.transcriptIsFinal.value = true
      await nextTick()

      expect(wrapper.emitted('command')).toBeUndefined()
      expect(wrapper.emitted('query')?.[0]).toEqual([
        { text: 'abre la ventana', source: 'speech' }
      ])
      expect(wrapper.find('input').exists()).toBe(false)
    })

    it('keeps text entry working when speech is unused', async () => {
      const wrapper = mount(AssistantCommandBar)

      await submit(wrapper, 'estado')

      expect(wrapper.emitted('command')?.[0]).toEqual(['status'])
      expect(speechControls.press).not.toHaveBeenCalled()
    })

    it('starts dictation with a tap without involving the diagnostic probe', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)
      await wrapper.get('[data-testid="assistant-speech"]').trigger('click')

      expect(speechControls.press).toHaveBeenCalledTimes(1)
      expect(speechControls.release).not.toHaveBeenCalled()
    })

    it('stops dictation with a second tap', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)
      await wrapper.get('[data-testid="assistant-speech"]').trigger('click')
      speechControls.state.value = 'listening'
      await nextTick()
      await wrapper.get('[data-testid="assistant-speech"]').trigger('click')

      expect(speechControls.press).toHaveBeenCalledTimes(1)
      expect(speechControls.release).toHaveBeenCalledTimes(1)
    })

    it('shows recognizer failure reasons next to the dictation control', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)
      speechControls.state.value = 'unavailable'
      speechControls.reason.value = 'no-speech'
      await nextTick()

      expect(wrapper.text()).toContain('no-speech')
    })
  })

  describe('the quick commands', () => {
    it('offers every command §11 names', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)

      const labels = wrapper.findAll('[data-testid="assistant-quick"]')
        .map(button => button.text())

      expect(labels).toEqual([
        'Estado',
        'DTC',
        'Temperatura',
        'Testigo',
        'Guardar nota'
      ])
    })

    it('emits without making the driver type', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)

      await wrapper.findAll('[data-testid="assistant-quick"]')[0]!
        .trigger('click')

      expect(wrapper.emitted('command')?.[0]).toEqual(['status'])
    })

    it('marks the unsupported one instead of hiding it', async () => {
      const wrapper = mount(AssistantCommandBar)

      await openBar(wrapper)

      const note = wrapper.findAll('[data-testid="assistant-quick"]')[4]!

      expect(note.attributes('disabled')).toBeDefined()
    })
  })

  it('can be closed again', async () => {
    const wrapper = mount(AssistantCommandBar)

    await openBar(wrapper)
    await wrapper.get('[data-testid="assistant-open"]').trigger('click')

    expect(wrapper.find('input').exists()).toBe(false)
  })
})
