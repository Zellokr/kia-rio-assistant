// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import LabPage from '~/pages/lab/index.vue'
import ConnectionView from '~/components/ConnectionView.vue'
import BottomTabBar from '~/components/BottomTabBar.vue'
import LogView from '~/components/LogView.vue'
import { InMemoryObdPersistenceAdapter } from '~~/core/obd/persistence/InMemoryObdPersistenceAdapter'
import { provideObdPersistence } from './support/obdPersistenceInjection'
import { labTransportFactoryKey } from '~/utils/labTransportFactory'
import { ReplayObdTransport } from '~~/core/obd/transport/ReplayObdTransport'
import type { ObdTransport } from '~~/core/obd/transport/ObdTransport'
import { createSession, responseEvents } from '../fixtures/obdReplaySessions'

/**
 * The page can now be driven to a connected session, because the transport
 * it talks to is injected rather than built inline.
 *
 * None of this is vehicle validation. A replayed transcript is a recording
 * of an adapter, not an adapter; what these tests prove is that the page's
 * own orchestration drives the handshake, the capability walk and the drop
 * handling correctly, which no source-text assertion could.
 */

/**
 * The six ELM327 setup commands the initializer sends, then one capability
 * range whose bitmask clears bit 0 — so the walk stops at 0100 instead of
 * asking for a range this transcript does not carry.
 */
function readySessionEvents() {
  return [
    ...responseEvents('c1', 'ATZ', ['ELM327 v1.5\r>'], 'ELM327 v1.5', 'at-ok'),
    ...responseEvents('c2', 'ATE0', ['OK\r>'], 'OK', 'at-ok'),
    ...responseEvents('c3', 'ATL0', ['OK\r>'], 'OK', 'at-ok'),
    ...responseEvents('c4', 'ATS0', ['OK\r>'], 'OK', 'at-ok'),
    ...responseEvents('c5', 'ATH0', ['OK\r>'], 'OK', 'at-ok'),
    ...responseEvents('c6', 'ATSP0', ['OK\r>'], 'OK', 'at-ok'),
    ...responseEvents('c7', '0100', ['4100BE3EB810\r>'], '4100BE3EB810')
  ]
}

function readySession() {
  return createSession(readySessionEvents())
}
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

function mountWithTransport(transport: ObdTransport) {
  return mount(LabPage, {
    global: {
      stubs,
      provide: { [labTransportFactoryKey as symbol]: () => transport }
    }
  })
}

async function connectSession(wrapper: ReturnType<typeof mountWithTransport>) {
  const connection = () => wrapper.findComponent(ConnectionView)

  await connection().vm.$emit('select-device')
  await vi.waitFor(() => {
    expect(connection().props('sessionState')).toBe('selected')
  })

  await connection().vm.$emit('connect')
  await vi.waitFor(() => {
    expect([
      connection().props('sessionState'),
      connection().props('transportError')
    ]).toEqual(['ready', ''])
  })
}

describe('lab page session', () => {
  it('reaches a ready session over a replayed adapter', async () => {
    const wrapper = mountWithTransport(new ReplayObdTransport(readySession()))

    await connectSession(wrapper)

    expect(wrapper.findComponent(ConnectionView).props('transportError')).toBe('')
  })

  /**
   * Replaces a source-text assertion that matched `transport.subscribeState(`,
   * `isObdTransportUnavailable` and `failSession()`. The scenario those
   * strings stood for is a link that dies while the session sits ready —
   * disconnecting the transport behind the page's back, which is what a lost
   * Bluetooth link looks like from here.
   */
  it('records an unexpected drop instead of holding a stale ready badge', async () => {
    const transport = new ReplayObdTransport(readySession())
    const wrapper = mountWithTransport(transport)

    await connectSession(wrapper)

    await transport.disconnect()
    await wrapper.vm.$nextTick()

    await wrapper.findComponent(BottomTabBar).vm.$emit('select', 'log')

    const messages = wrapper.findComponent(LogView).props('events')
      .map(event => JSON.stringify(event))
      .join('\n')

    expect(messages).toContain('Transport link lost unexpectedly')
  })

  /**
   * Replaces a source-text assertion that matched a regex over
   * `decoded: { kind: 'dtc', observations` and `schemaVersion: 2 as const`.
   * What it stood for is the shape the page hands to persistence after a
   * Mode 03 read, so the injected store is asked what it actually received.
   */
  it('persists Mode 03 observations on the v2 boundary', async () => {
    const persistence = new InMemoryObdPersistenceAdapter()

    provideObdPersistence(useNuxtApp(), persistence)

    const transport = new ReplayObdTransport(createSession([
      ...readySessionEvents(),
      ...responseEvents('c8', '03', ['4300430300\r>'], '4300430300')
    ]))
    const wrapper = mountWithTransport(transport)

    await connectSession(wrapper)

    await wrapper.findComponent(BottomTabBar).vm.$emit('select', 'data')
    await wrapper.findAll('button')
      .find(button => button.text().includes('Códigos almacenados'))
      ?.trigger('click')

    await vi.waitFor(async () => {
      expect(await persistence.listObservations()).not.toHaveLength(0)
    })

    const [observation] = await persistence.listObservations()

    expect(observation).toMatchObject({ schemaVersion: 2 })
  })
})
