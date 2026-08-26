import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * Minimal by design.
 *
 * It exists for exactly two reasons: Vue single-file components need a
 * transform before they can be mounted, and component sources use Nuxt's
 * `~` / `~~` aliases, which Nuxt resolves at build time and Vitest does
 * not. Everything else — include patterns, the default node environment —
 * is left at Vitest's defaults so the existing suite runs unchanged. The
 * DOM environment is opted into per file with a
 * `// @vitest-environment happy-dom` docblock, not globally.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url))
    }
  }
})
