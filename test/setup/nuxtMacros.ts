import { beforeEach } from 'vitest'
import { ref, type Ref } from 'vue'

/**
 * Nuxt compiles `definePageMeta` away at build time, so the macro never
 * exists at runtime. Vitest transforms pages with bare `@vitejs/plugin-vue`,
 * which leaves the call in place — mounting a page would throw
 * `ReferenceError: definePageMeta is not defined` before any assertion runs.
 *
 * The stub is deliberately inert: page metadata is routing configuration,
 * and nothing a mounted page does in a test depends on it.
 */
(globalThis as Record<string, unknown>).definePageMeta = () => {}

/**
 * `useState` is Nuxt's keyed, SSR-safe shared state. The stub keeps the part
 * that callers actually depend on — the same key hands back the same ref —
 * and drops the payload serialisation, which only matters across an SSR
 * boundary that no test crosses.
 *
 * The store is cleared before every test. Sharing by key is the contract;
 * sharing across tests would be a leak, and a telemetry snapshot surviving
 * into the next test is exactly the kind of false green this suite exists
 * to prevent.
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

beforeEach(() => {
  sharedState.clear()
})

export {}
