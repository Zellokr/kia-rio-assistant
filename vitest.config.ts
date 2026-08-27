import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * Minimal by design.
 *
 * It exists for exactly three reasons: Vue single-file components need a
 * transform before they can be mounted, component sources use Nuxt's
 * `~` / `~~` aliases, which Nuxt resolves at build time and Vitest does
 * not, and pages call Nuxt macros that the build compiles away. Everything
 * else — include patterns, the default node environment — is left at
 * Vitest's defaults so the existing suite runs unchanged. The DOM
 * environment is opted into per file with a
 * `// @vitest-environment happy-dom` docblock, not globally.
 */
export default defineConfig({
  plugins: [vue()],
  test: {
    setupFiles: [
      fileURLToPath(new URL('./test/setup/nuxtMacros.ts', import.meta.url))
    ]
  },
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url))
    }
  }
})
