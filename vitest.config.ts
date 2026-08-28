import { fileURLToPath } from 'node:url'

import { defineVitestConfig } from '@nuxt/test-utils/config'

/**
 * Nuxt's own test environment, opted into per file.
 *
 * This used to be bare `@vitejs/plugin-vue` plus a hand-written shim that
 * stood in for `definePageMeta`, `useState`, `useNuxtApp` and `clearError`
 * on `globalThis`. Stand-ins cannot fail when they drift from the framework,
 * and this pair did drift: the shim never resolved auto-imported components,
 * so `LogView` mounted as nothing and a test asserted its absence as correct
 * while the real page rendered it on the wrong screen.
 *
 * Two things are required for `environment: 'nuxt'` to boot, and missing
 * either one produces the same unhelpful crash inside `setupNuxt`
 * (`Cannot read properties of undefined (reading 'sync')`):
 *
 *  1. `@nuxt/test-utils/module` must be listed in `nuxt.config.ts`.
 *  2. Nothing may assign `useNuxtApp` on `globalThis`, which is what the old
 *     shim did — it shadowed the real one and left `_route` undefined.
 *
 * The default stays `node`. Most of this suite tests `core/`, which never
 * imports Vue; standing up Nuxt for those would cost seconds per file and
 * buy nothing. Files ask for what they need with a `// @vitest-environment`
 * docblock — `nuxt` for anything touching pages, layouts or Nuxt composables,
 * `happy-dom` for components that only need a DOM.
 */
export default defineVitestConfig({
  /**
   * TEMPORARY — field-test evidence delivery. Mirrors the `vite.define` in
   * `nuxt.config.ts`; see `docs/FIELD_TEST_TELEGRAM.md`. Without it the
   * composable throws a ReferenceError under test. See `telegramFieldLog.ts`.
   */
  define: {
    __FIELD_TEST_TELEGRAM__: JSON.stringify(
      process.env.FIELD_TEST_TELEGRAM === '1'
    )
  },
  test: {
    environment: 'node'
  },
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url))
    }
  }
})
