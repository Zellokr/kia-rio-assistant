// @vitest-environment nuxt
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AssistantCommandBar from '../../app/components/AssistantCommandBar.vue'

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
     * Silence beats a guess, but silence beats nothing at all even more:
     * the driver must be told the app did not understand, rather than left
     * looking at a field that swallowed the request.
     */
    it('says it did not understand instead of guessing', async () => {
      const wrapper = mount(AssistantCommandBar)

      await submit(wrapper, 'por que suena raro el motor')

      expect(wrapper.emitted('command')).toBeUndefined()

      expect(wrapper.text()).toContain('No he entendido')
    })

    it('stays open after a failure, so the text can be corrected', async () => {
      const wrapper = mount(AssistantCommandBar)

      await submit(wrapper, 'por que suena raro el motor')

      expect(wrapper.find('input').exists()).toBe(true)
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
