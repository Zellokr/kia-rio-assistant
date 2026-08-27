// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import LabPage from '~/pages/lab/index.vue'
import ConnectionView from '~/components/ConnectionView.vue'
import { InMemoryObdPersistenceAdapter } from '~~/core/obd/persistence/InMemoryObdPersistenceAdapter'
import type { ObdPersistence } from '~~/data/repositories/createObdPersistence'
import { provideNuxtInjections } from '../setup/nuxtMacros'

/**
 * These tests replace three assertions that matched the page's own source
 * text — `void operation.catch(...)`, `new BufferedObdSessionRecorder` and
 * `persistence.recordObservations`. Matching an implementation string
 * proves the line was typed, not that a failing write leaves the session
 * alone, so the claim and the evidence were unrelated. The page is mounted
 * here and a persistence is injected through the same `$obdPersistence` key
 * the client plugin uses.
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

/**
 * What the Android bridge says when it is asked to select an adapter off the
 * device. Asserted verbatim on purpose: a test that only checked for a
 * non-empty error would still pass if the page crashed on its own
 * persistence wiring and reported the TypeError instead.
 */
const ADAPTER_UNAVAILABLE
  = 'Android BLE OBD is available only in the Capacitor Android app'
    + ' after a reviewed VEEPEAK GATT inventory supplies the BLE profile UUIDs.'

/**
 * `InMemoryObdPersistenceAdapter` swallows its own write failures and
 * degrades instead of rejecting, so it cannot exercise the page's catch.
 * A store whose writes reject is what the non-blocking guarantee is about.
 */
function rejectingPersistence(): ObdPersistence {
  const reject = () => Promise.reject(new Error('quota'))

  return {
    startSession: reject,
    updateSession: reject,
    appendEvents: reject,
    listSessions: reject,
    loadSession: reject,
    deleteSession: reject,
    recordObservations: reject,
    listObservations: reject,
    deleteObservation: reject,
    read: reject,
    write: reject
  } as unknown as ObdPersistence
}

function mountLabPage() {
  return mount(LabPage, { global: { stubs } })
}

/**
 * Picking the adapter is what opens a session log, and the session log is
 * what the persistence wiring subscribes to. Selection then fails, because
 * Capacitor reports a web platform under Vitest — which is fine: the
 * persisted session must already exist by then.
 */
async function selectAdapter(wrapper: ReturnType<typeof mountLabPage>) {
  await wrapper.findComponent(ConnectionView).vm.$emit('select-device')
  await wrapper.vm.$nextTick()
  await Promise.resolve()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('lab page persistence', () => {
  it('persists a session as soon as the driver picks the adapter', async () => {
    const persistence = new InMemoryObdPersistenceAdapter()

    provideNuxtInjections({ $obdPersistence: persistence })

    await selectAdapter(mountLabPage())

    expect(await persistence.listSessions()).toHaveLength(1)
  })

  /**
   * The non-blocking guarantee, in both halves: a rejected write is routed
   * to the handler instead of escaping as an unhandled rejection, and it
   * does not stop the adapter's own error reaching the driver.
   */
  it('routes a rejected write away from the session', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    provideNuxtInjections({ $obdPersistence: rejectingPersistence() })

    const wrapper = mountLabPage()

    await selectAdapter(wrapper)

    expect(warn).toHaveBeenCalledWith(
      'OBD persistence failed without affecting the active session',
      expect.any(Error)
    )
    expect(wrapper.findComponent(ConnectionView).props('transportError'))
      .toBe(ADAPTER_UNAVAILABLE)
  })

  /**
   * The page must not require the plugin. On a platform where it never ran,
   * `$obdPersistence` is absent and the session has to work regardless —
   * reporting the adapter's error, not a TypeError from its own wiring.
   */
  it('runs without any persistence at all', async () => {
    provideNuxtInjections({})

    const wrapper = mountLabPage()

    await selectAdapter(wrapper)

    expect(wrapper.findComponent(ConnectionView).props('transportError'))
      .toBe(ADAPTER_UNAVAILABLE)
  })
})
