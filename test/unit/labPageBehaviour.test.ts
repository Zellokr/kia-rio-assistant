// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import LabPage from '~/pages/lab/index.vue'
import ConnectionView from '~/components/ConnectionView.vue'
import BottomTabBar from '~/components/BottomTabBar.vue'

/**
 * The lab page is the integration point: it owns transport selection, the
 * session state machine, telemetry polling, diagnostics and the log. Until
 * now it was covered only by `readFileSync` string matching, which cannot
 * observe any of that. These tests mount it and drive it.
 *
 * Nuxt UI primitives are stubbed because they are third-party chrome; the
 * project's own components are mounted for real, so what the tests assert
 * is what a user would see.
 */
const stubs = {
  UAlert: { template: '<div><slot />{{ description }}</div>', props: ['description'] },
  UBadge: { template: '<span><slot /></span>' },
  UButton: { template: '<button :disabled="disabled"><slot /></button>', props: ['disabled'] },
  UCard: { template: '<div><slot /></div>' },
  UContainer: { template: '<div><slot /></div>' },
  UIcon: { template: '<span />' },
  UInput: { template: '<input />' },
  USelect: { template: '<select><slot /></select>' }
}

function mountLabPage() {
  return mount(LabPage, { global: { stubs } })
}

describe('lab page', () => {
  it('opens on the connection view', () => {
    const wrapper = mountLabPage()

    expect(wrapper.findComponent(ConnectionView).exists()).toBe(true)
  })

  it('moves to the view the tab bar asks for', async () => {
    const wrapper = mountLabPage()

    await wrapper.findComponent(BottomTabBar).vm.$emit('select', 'log')

    expect(wrapper.findComponent(ConnectionView).exists()).toBe(false)
    expect(wrapper.text()).toContain('Registro')
  })

  it('shows the diagnostic reads only on the data view', async () => {
    const wrapper = mountLabPage()

    expect(wrapper.text()).not.toContain('Leer códigos de avería')

    await wrapper.findComponent(BottomTabBar).vm.$emit('select', 'data')

    expect(wrapper.text()).toContain('Leer códigos de avería')
    expect(wrapper.text()).toContain('Códigos almacenados')
  })

  /**
   * The regression guard for the deleted mock and replay branches. Neither
   * value can be picked from the selector any more, but the prop type still
   * admits them, so a stale value must fail loudly instead of selecting
   * nothing at all.
   */
  it.each(['mock', 'replay'] as const)(
    'refuses to select the unavailable %s transport',
    async (transportChoice) => {
      const wrapper = mountLabPage()
      const connection = wrapper.findComponent(ConnectionView)

      await connection.vm.$emit('update:transportChoice', transportChoice)
      await connection.vm.$emit('select-device')
      await wrapper.vm.$nextTick()

      expect(wrapper.findComponent(ConnectionView).props('transportError'))
        .toBe('Transporte no disponible en la aplicación')
    }
  )

  /**
   * Capacitor reports a web platform under Vitest, so the Android bridge
   * rejects. The page must surface that as a message rather than let the
   * rejection escape and blank the view.
   */
  it('surfaces an adapter failure instead of crashing', async () => {
    const wrapper = mountLabPage()
    const connection = wrapper.findComponent(ConnectionView)

    await connection.vm.$emit('select-device')
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(ConnectionView).exists()).toBe(true)
    expect(wrapper.findComponent(ConnectionView).props('transportError'))
      .not.toBe('')
  })
})
