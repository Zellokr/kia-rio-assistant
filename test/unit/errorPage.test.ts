// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

import ErrorPage from '~/error.vue'

/**
 * `clearError` dismisses the error state and navigates. Mocked through Nuxt's
 * own import machinery, so what is replaced is the real binding the page
 * resolves rather than a global this test happened to set first.
 */
const { clearErrorMock } = vi.hoisted(() => ({ clearErrorMock: vi.fn() }))

mockNuxtImport('clearError', () => clearErrorMock)

beforeEach(() => {
  clearErrorMock.mockClear()
})

/**
 * `nuxt generate` emits `404.html` as the SPA fallback shell — the same 2.5 kB
 * of empty document as `200.html` — so a successful build proves this file
 * compiles and says nothing about what it renders. It is mounted here for the
 * same reason every other view is.
 */
const stubs = {
  UApp: { template: '<div><slot /></div>' },
  NuxtLayout: { template: '<div><slot /></div>' },
  UContainer: { template: '<div><slot /></div>' },
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }
}

function mountError(error: Record<string, unknown>) {
  return mount(ErrorPage, {
    props: { error },
    global: { stubs }
  })
}

describe('the error page', () => {
  it('names a missing route as missing rather than as a failure', () => {
    const text = mountError({ statusCode: 404, message: 'Page not found' }).text()

    expect(text).toContain('Esta página no existe')
    expect(text).not.toContain('Algo ha fallado')
  })

  /**
   * A 404 carries a framework message in English that describes the route,
   * not the vehicle. Showing it under Spanish copy would be noise.
   */
  it('hides the raw message on a missing route', () => {
    const text = mountError({ statusCode: 404, message: 'Page not found' }).text()

    expect(text).not.toContain('Page not found')
  })

  /**
   * On a real failure the opposite holds. The person holding the phone is the
   * person who reports the fault, and a message they cannot see is one they
   * cannot report.
   */
  it('shows the raw message on a real failure', () => {
    const text = mountError({
      statusCode: 500,
      message: 'IndexedDB quota exceeded'
    }).text()

    expect(text).toContain('Algo ha fallado')
    expect(text).toContain('IndexedDB quota exceeded')
  })

  /**
   * The claim that matters to a driver: whatever broke, nothing was sent to
   * the car. Asserted verbatim because a weaker check would pass on any
   * reassuring-sounding sentence.
   */
  it('states that nothing reached the vehicle', () => {
    expect(mountError({ statusCode: 500, message: 'boom' }).text())
      .toContain('No se ha enviado nada al vehículo.')
  })

  it('offers the lab as the way out', async () => {
    const wrapper = mountError({ statusCode: 500, message: 'boom' })

    await wrapper.find('button').trigger('click')

    expect(clearErrorMock).toHaveBeenCalledWith({ redirect: '/' })
  })
})
