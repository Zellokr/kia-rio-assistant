// @vitest-environment nuxt
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import BottomTabBar from '~/components/BottomTabBar.vue'
import DiagnosticsView from '../../app/components/DiagnosticsView.vue'
import LabPage from '~/pages/index.vue'

/**
 * RF-037's button, end to end.
 *
 * The composer is proven pure in `composeWorkshopReport.test.ts`. What is
 * proven here is the part a unit test cannot see: that pressing the control
 * puts that text on the clipboard, and that a refused clipboard is reported
 * rather than swallowed. The log view's download button was removed on
 * 2026-08-28 precisely because it looked like it worked and did nothing.
 */

const stubs = {
  UAlert: { template: '<div><slot />{{ description }}</div>', props: ['description'] },
  UBadge: { template: '<span><slot /></span>' },
  // No explicit click emit: Vue falls the listener through to the root
  // <button>. Re-emitting as well would fire every handler twice.
  UButton: {
    template: '<button :disabled="disabled"><slot /></button>',
    props: ['disabled', 'loading', 'color', 'variant', 'size', 'icon']
  },
  UCard: { template: '<div><slot name="header" /><slot /></div>' },
  UContainer: { template: '<div><slot /></div>' },
  UIcon: { template: '<span />' },
  UInput: { template: '<input />' },
  USelect: { template: '<select><slot /></select>' }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** The page opens on Conexión, so the diagnostics view has to be selected. */
async function openDiagnostics() {
  const wrapper = mount(LabPage, { global: { stubs } })

  await wrapper.findComponent(BottomTabBar).vm.$emit('select', 'diagnostics')
  await wrapper.vm.$nextTick()

  return wrapper
}

function findReportButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button')
    .find(button => button.text().includes('Copiar informe para el taller'))
}

describe('the workshop report control', () => {
  it('asks the page to copy when pressed', async () => {
    const wrapper = mount(DiagnosticsView, {
      props: {
        busy: false,
        adapterConnected: false,
        errorMessage: '',
        assessment: undefined,
        reads: []
      },
      global: { stubs }
    })

    await findReportButton(wrapper)?.trigger('click')

    expect(wrapper.emitted('copy-report')).toHaveLength(1)
  })

  it('puts a three-section report on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const wrapper = await openDiagnostics()

    await wrapper.findComponent(DiagnosticsView).vm.$emit('copy-report')
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(writeText).toHaveBeenCalledTimes(1)

    const text = writeText.mock.calls[0]?.[0] as string

    expect(text).toContain('HECHOS')
    expect(text).toContain('INTERPRETACIÓN')
    expect(text).toContain('LIMITACIONES')
    // The limits that hold for every session, so a workshop reading a clean
    // report still knows nothing was cleared and no freeze frame was read.
    expect(text).toContain('no se ha borrado ningún código')
    expect(text).toContain('trama congelada')
  })

  it('tells the driver when the clipboard refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))

    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const wrapper = await openDiagnostics()

    await wrapper.findComponent(DiagnosticsView).vm.$emit('copy-report')
    await wrapper.vm.$nextTick()
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('No se pudo copiar')
  })
})
