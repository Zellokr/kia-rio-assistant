// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import ConnectionStatusBadge from '~/components/ConnectionStatusBadge.vue'
import { useSessionStateBeacon } from '~/composables/useSessionStateBeacon'
import { describeSessionStatus } from '~/utils/sessionStatusPresentation'
import {
  OBD_SESSION_STATES
} from '~~/core/obd/session/ObdSessionStateMachine'

/**
 * The header badge is on screen on every destination, so it is the only
 * thing telling somebody on Datos or Registro whether the car is still
 * answering. If it goes stale or silent it is the same failure as the
 * frozen readings: a screen quietly asserting something that stopped being
 * true.
 */
const stubs = {
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' }
}

/**
 * The template opens with a comment, which makes the component a fragment —
 * so the badge is found by role rather than read off the wrapper root.
 */
function render() {
  return mount(ConnectionStatusBadge, { global: { stubs } })
}

function badge(wrapper: ReturnType<typeof render>) {
  return wrapper.find('[role="status"]')
}

describe('ConnectionStatusBadge', () => {
  beforeEach(() => {
    useSessionStateBeacon().value = 'idle'
  })

  it('follows the state the page publishes', async () => {
    const wrapper = render()
    const beacon = useSessionStateBeacon()

    expect(wrapper.text()).toContain('Sin conexión')

    beacon.value = 'ready'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Conectado')
  })

  /**
   * `color-not-decorative-only`. The label is hidden on a narrow header, so
   * the icon has to carry the state alongside the colour — and the full
   * sentence has to stay reachable for a screen reader either way.
   */
  it.each(OBD_SESSION_STATES)('identifies %s without relying on colour', async (state) => {
    const wrapper = render()
    const expected = describeSessionStatus(state)

    useSessionStateBeacon().value = state
    await wrapper.vm.$nextTick()

    expect(wrapper.find(`[data-icon="${expected.icon}"]`).exists()).toBe(true)
    expect(badge(wrapper).attributes('aria-label')).toContain(expected.label)
  })

  it('animates only while something is in flight', async () => {
    const wrapper = render()
    const beacon = useSessionStateBeacon()

    beacon.value = 'connecting'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.animate-ping').exists()).toBe(true)

    beacon.value = 'ready'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.animate-ping').exists()).toBe(false)
  })

  it('announces a change to a screen reader', () => {
    const wrapper = render()

    expect(badge(wrapper).exists()).toBe(true)
    expect(badge(wrapper).attributes('aria-live')).toBe('polite')
  })
})
