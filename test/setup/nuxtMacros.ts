import { beforeEach } from 'vitest'

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
 *
 * ## Why this file exists instead of `@nuxt/test-utils`
 *
 * The framework's own test environment is the right answer to this problem:
 * real auto-imports and real macros cannot drift from the framework the way
 * hand-written stand-ins can. It was tried on 2026-08-28 with
 * `@nuxt/test-utils` 4.1.0 and 4.2.0 — the latest — against Nuxt 4.5.1, and
 * its environment does not boot here:
 *
 *     TypeError: Cannot read properties of undefined (reading 'sync')
 *       at sync (@nuxt/test-utils/dist/runtime/shared/nuxt.mjs:8:25)
 *       at setupNuxt (…/shared/nuxt.mjs:15:9)
 *
 * `setupNuxt` reads `nuxtApp._route.sync` unconditionally and `_route` is
 * undefined. A file containing nothing but `expect(1 + 1).toBe(2)` fails
 * the same way, so this is the environment's own bootstrap rather than
 * anything about this project's code, and no configuration reached it:
 * a regenerated `.nuxt`, an explicit `domEnvironment`, and both released
 * versions all produced the identical trace.
 *
 * So the stubs stay, and the cost stays with them: every component and
 * composable in `app/` imports Vue and its own dependencies explicitly,
 * because nothing here provides auto-imports. That is a real constraint on
 * the source, not a style choice — see any `import { ref } from 'vue'` in a
 * component and this is why.
 *
 * Worth retrying when `@nuxt/test-utils` releases past 4.2.0. If it boots,
 * this file and the explicit imports it forces can both go.
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

/**
 * `clearError` dismisses the error state and navigates. The stub records the
 * argument so a test can assert where the page offers to send the user; the
 * navigation itself belongs to a router no test here stands up.
 */
const clearedErrors: Record<string, unknown>[] = []

export function recordedClearErrorCalls(): Record<string, unknown>[] {
  return clearedErrors
}

(globalThis as Record<string, unknown>).clearError = (
  options: Record<string, unknown> = {}
) => {
  clearedErrors.push(options)
}

beforeEach(() => {
  pageMeta.length = 0
  nuxtApp = {}
  clearedErrors.length = 0
})
