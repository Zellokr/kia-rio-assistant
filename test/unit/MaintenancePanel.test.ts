// @vitest-environment nuxt
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import MaintenancePanel from '../../app/components/MaintenancePanel.vue'
import {
  InMemoryObdPersistenceAdapter
} from '../../core/obd/persistence/InMemoryObdPersistenceAdapter'
import type { ObdPersistence } from '../../data/repositories/createObdPersistence'
import { provideObdPersistence } from './support/obdPersistenceInjection'

/**
 * The panel is the producer the maintenance store shipped without. These
 * tests mount it against a real in-memory store rather than a spy, so what is
 * asserted is that a row landed — not that a function was called.
 */

const stubs = {
  UCard: { template: '<div><slot name="header" /><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UButton: {
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
    props: ['disabled', 'loading', 'type']
  },
  UInput: {
    template: '<input :id="id" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'id', 'type', 'placeholder', 'min', 'inputmode', 'autocomplete']
  }
}

/**
 * The store is injected the way the client plugin provides it, never as a
 * prop. A prop would be wrapped in Vue's reactivity, and the in-memory
 * adapter clones rows with `structuredClone`, which refuses a proxy — the
 * bug this panel was written into and refactored out of.
 */
function mountPanel(persistence: ObdPersistence | undefined) {
  provideObdPersistence(useNuxtApp(), persistence)

  return mount(MaintenancePanel, { global: { stubs } })
}

async function fillAndSubmit(
  wrapper: ReturnType<typeof mountPanel>,
  values: Record<string, string>
) {
  for (const [id, value] of Object.entries(values)) {
    await wrapper.get(`#${id}`).setValue(value)
  }

  await wrapper.get('form').trigger('submit')
  // save() awaits the write and then re-reads the store, so a couple of
  // ticks is not enough: the render depends on the reload landing.
  await flushPromises()
  await nextTick()
}

const oilChange = {
  'maintenance-item': 'Cambio de aceite y filtro',
  'maintenance-date': '2026-08-14',
  'maintenance-odometer': '92400',
  'maintenance-interval-km': '15000',
  'maintenance-interval-months': '12'
}

describe('MaintenancePanel', () => {
  it('writes what the owner typed into the store and queues it for sync', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T10:00:00.000Z'))

    try {
      const persistence = new InMemoryObdPersistenceAdapter()

      await fillAndSubmit(mountPanel(persistence), oilChange)

      const stored = await persistence.listMaintenanceRecords()

      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({
        schemaVersion: 1,
        performedAt: '2026-08-14',
        odometerKm: 92_400,
        item: 'Cambio de aceite y filtro',
        notes: null,
        interval: { km: 15_000, months: 12 }
      })

      expect(await persistence.listPendingOperations()).toEqual([{
        schemaVersion: 1,
        id: `maintenance:${stored[0]!.id}`,
        kind: 'maintenance',
        recordId: stored[0]!.id,
        enqueuedAt: '2026-09-02T10:00:00.000Z',
        attempts: 0
      }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the projected service and names the reading it used', async () => {
    const persistence = new InMemoryObdPersistenceAdapter()
    const wrapper = mountPanel(persistence)

    await fillAndSubmit(wrapper, oilChange)

    const text = wrapper.text()

    expect(text).toContain('Cambio de aceite y filtro')
    // 92 400 + 15 000, formatted for a Spanish reader.
    expect(text).toContain('107.400')
    // The provenance line: without it a kilometre figure reads as something
    // the app measured from the car, and it never is.
    expect(text).toContain('que registraste el 2026-08-14')
  })

  it('refuses a record with nothing naming what was done', async () => {
    const persistence = new InMemoryObdPersistenceAdapter()
    const wrapper = mountPanel(persistence)

    await fillAndSubmit(wrapper, {
      ...oilChange,
      'maintenance-item': '   '
    })

    expect(await persistence.listMaintenanceRecords()).toEqual([])
    expect(wrapper.text()).toContain('Revisa la fecha')
  })

  it('says so instead of failing when the device has no store', async () => {
    const wrapper = mountPanel(undefined)

    expect(wrapper.text()).toContain('no tiene almacenamiento local')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })
})
