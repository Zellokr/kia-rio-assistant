// @vitest-environment nuxt
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import LabPage from '~/pages/lab/index.vue'
import ConnectionView from '~/components/ConnectionView.vue'

/**
 * Resolved from this file rather than the process cwd, and without the
 * global `URL`, which happy-dom replaces with the DOM implementation.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const indexPagePath = resolve(REPO_ROOT, 'app/pages/index.vue')
const labPagePath = resolve(REPO_ROOT, 'app/pages/lab/index.vue')

const stubs = {
  UAlert: { template: '<div><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UButton: { template: '<button><slot /></button>' },
  UCard: { template: '<div><slot /></div>' },
  UContainer: { template: '<div><slot /></div>' },
  UIcon: { template: '<span />' },
  UInput: { template: '<input />' },
  USelect: { template: '<select><slot /></select>' }
}

describe('Android entry route', () => {
  it('leaves the root free for the lab page to claim', () => {
    expect(existsSync(indexPagePath)).toBe(false)
  })

  /**
   * The alias is read from the `definePageMeta` call the page actually
   * makes, not from its source text. That is the declaration; Nuxt's own
   * route table is built at build time and is out of a unit test's reach,
   * so what this pins is that the page still asks for the root.
   */
  /**
   * Asked of the router rather than of the macro's argument. The comment
   * above used to say the route table is built at build time and is out of
   * a unit test's reach; under the real Nuxt environment it is not, so this
   * pins where `/` actually lands instead of what the page asked for.
   */
  it('serves the laboratory at the root', () => {
    const resolved = useRouter().resolve('/')

    expect(resolved.matched.length).toBeGreaterThan(0)
    expect(resolved.matched[0]?.path).toBe('/')
  })

  it('renders the laboratory rather than a starter template', () => {
    const wrapper = mount(LabPage, { global: { stubs } })

    expect(wrapper.findComponent(ConnectionView).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Nuxt Starter Template')
  })

  /**
   * The one assertion here that stays on the source text, deliberately.
   * A redirect is the absence of a behaviour, and proving absence by
   * mounting would need a router the page does not otherwise use. Keeping
   * a redirect out of the entry point is worth the narrow structural check.
   */
  it('does not redirect away from the entry point', () => {
    expect(readFileSync(labPagePath, 'utf8')).not.toContain('navigateTo(')
  })
})
