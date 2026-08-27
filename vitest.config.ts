import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vitest/config'

/**
 * Nuxt replaces `import.meta.client` at build time. Vite's `define` does not
 * substitute arbitrary `import.meta` members, so without this the flag reads
 * `undefined`, every mounted page takes its server branch, and the
 * persistence wiring is skipped — the opposite of what runs on the device,
 * and a way for a test to pass while asserting nothing.
 */
function nuxtClientFlag(): Plugin {
  return {
    name: 'test-nuxt-client-flag',
    enforce: 'pre',
    transform(code, id) {
      if (!code.includes('import.meta.client') || id.includes('node_modules')) {
        return null
      }

      return { code: code.replaceAll('import.meta.client', 'true'), map: null }
    }
  }
}

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
  plugins: [nuxtClientFlag(), vue()],
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
