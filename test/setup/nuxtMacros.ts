import { beforeEach } from 'vitest'
import { ref, type Ref } from 'vue'

/**
 * Nuxt supplies a handful of things at build time that a page's `<script
 * setup>` calls as if they were globals. Vitest transforms pages with bare
 * `@vitejs/plugin-vue`, which leaves those calls in place, so mounting a
 * page throws a ReferenceError before any assertion runs. Each stub below
 * keeps the part of the contract that the page actually depends on and
 * drops the rest.
 *
 * Every store is cleared before each test. Sharing within a test is the
 * contract; sharing across tests is a leak, and a snapshot surviving into
 * the next test is exactly the kind of false green these stubs exist to
 * avoid.
 */

/**
 * `definePageMeta` is routing configuration that Nuxt compiles away. The
 * stub records the argument so a test can assert what the page declared —
 * which is the declaration, not proof that Nuxt routes it.
 */
const pageMeta: Record<string, unknown>[] = []

export function recordedPageMeta(): Record<string, unknown>[] {
  return pageMeta
}

(globalThis as Record<string, unknown>).definePageMeta = (
  meta: Record<string, unknown>
) => {
  pageMeta.push(meta)
}

/**
 * `useState` is Nuxt's keyed, SSR-safe shared state. The stub keeps the part
 * callers depend on — the same key hands back the same ref — and drops the
 * payload serialisation, which only matters across an SSR boundary that no
 * test crosses.
 */
const sharedState = new Map<string, Ref<unknown>>()

function useStateStub<T>(key: string, init?: () => T): Ref<T> {
  const existing = sharedState.get(key)

  if (existing !== undefined) {
    return existing as Ref<T>
  }

  const created = ref(init?.()) as Ref<T>

  sharedState.set(key, created)

  return created
}

(globalThis as Record<string, unknown>).useState = useStateStub

/**
 * `useNuxtApp` carries the plugin-provided injections. Only `$obdPersistence`
 * matters here, and it is absent by default so a page mounts with
 * persistence switched off, exactly as it behaves before the client plugin
 * has run. A test that wants the persistence path injects its own.
 */
let nuxtApp: Record<string, unknown> = {}

export function provideNuxtInjections(injections: Record<string, unknown>): void {
  nuxtApp = injections
}

(globalThis as Record<string, unknown>).useNuxtApp = () => nuxtApp

beforeEach(() => {
  pageMeta.length = 0
  sharedState.clear()
  nuxtApp = {}
})
