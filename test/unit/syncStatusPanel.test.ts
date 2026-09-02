// @vitest-environment nuxt
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SyncStatusPanel from '../../app/components/SyncStatusPanel.vue'
import {
  InMemoryObdPersistenceAdapter
} from '../../core/obd/persistence/InMemoryObdPersistenceAdapter'
import { provideObdPersistence } from './support/obdPersistenceInjection'

/**
 * The panel that gives `drainSyncQueue` a caller.
 *
 * The store is injected the way the client plugin provides it, never as a
 * prop: `listPendingOperations` clones its rows with `structuredClone`, and
 * Vue's reactivity would proxy the adapter, which `structuredClone` refuses.
 */

const stubs = {
  UCard: { template: '<div><slot name="header" /><slot /></div>' },
  UButton: {
    template: '<button :disabled="disabled"><slot /></button>',
    props: ['disabled', 'loading', 'color', 'variant']
  }
}

async function mountPanel(persistence: InMemoryObdPersistenceAdapter | undefined) {
  provideObdPersistence(useNuxtApp(), persistence as never)

  const wrapper = mount(SyncStatusPanel, { global: { stubs } })

  await flushPromises()

  return wrapper
}

describe('SyncStatusPanel', () => {
  it('reads the queue and says how much is owed', async () => {
    const persistence = new InMemoryObdPersistenceAdapter()

    // The row has to exist: an operation pointing at a session that is gone
    // is dropped on the first drain, which is correct and would empty the
    // queue before this assertion ran.
    await persistence.startSession({
      schemaVersion: 1,
      sessionId: 'one',
      startedAt: '2026-09-02T09:00:00.000Z',
      endedAt: null,
      transport: { kind: 'mock' },
      reconnectCount: 0,
      truncated: false
    })

    await persistence.enqueue({
      schemaVersion: 1,
      id: 'session:one',
      kind: 'session',
      recordId: 'one',
      enqueuedAt: '2026-09-02T10:00:00.000Z',
      attempts: 0
    })

    const wrapper = await mountPanel(persistence)

    // No Convex deployment answers in a test, so the drain fails and T-011
    // holds: the operation is still owed.
    expect(wrapper.text()).toContain('1 operación pendiente')
  })

  it('says plainly when nothing is owed', async () => {
    const wrapper = await mountPanel(new InMemoryObdPersistenceAdapter())

    expect(wrapper.text()).toContain('No hay nada pendiente')
  })

  it('renders without a store instead of failing', async () => {
    const wrapper = await mountPanel(undefined)

    expect(wrapper.text()).toContain('No hay nada pendiente')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })
})
