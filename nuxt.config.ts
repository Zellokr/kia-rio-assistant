// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/test-utils/module',
    '@lupinum/better-convex-nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark'
  },

  runtimeConfig: {
    public: {
      assistant: {
        endpointUrl: process.env.NUXT_PUBLIC_ASSISTANT_ENDPOINT_URL ?? ''
      }
    }
  },

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2026-06-30',

  /**
   * Convex is the Fase 4 backend (spec §8.1, RF-035). Empty options are the
   * documented Convex-only build: `convex.auth` is deliberately omitted, so
   * no Better Auth peer is installed and no auth proxy exists.
   *
   * The URL is passed explicitly, and the build script loads `.env.local`
   * with node's own `--env-file-if-exists`. Neither half is redundant:
   *
   * - `better-convex-nuxt-convex configure` writes `CONVEX_URL`, not the
   *   `NUXT_PUBLIC_` name, and the module's fallback to the unprefixed one
   *   resolves server-side — which a static `nuxt generate` build has none
   *   of.
   * - `nuxt generate --dotenv .env.local` does not populate `process.env`
   *   in time for this file to be evaluated, and this file is where a static
   *   build has to resolve the URL, because the APK has no server to look it
   *   up later.
   *
   * Measured on 2026-09-02 against the exact deployment string: with
   * `convex: {}` and a plain `nuxt generate`, **no file in the bundle carried
   * the URL**. With both halves, three do.
   *
   * The URL is public by design and is the only Convex value the client may
   * ever hold: RNF-006 keeps every key server-side, and this APK is a static
   * bundle that cannot hide one. An empty string is a supported build: the
   * app keeps its local queue and syncs nothing.
   */
  convex: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL
      ?? process.env.CONVEX_URL
      ?? ''
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  icon: {
    provider: 'none',
    clientBundle: {
      scan: true,
      // labNav.ts binds these dynamically (:icon="view.icon"), so the
      // template scanner can't detect them statically — list explicitly.
      icons: [
        'lucide:plug-zap',
        'lucide:gauge',
        'lucide:stethoscope',
        'lucide:triangle-alert',
        'lucide:scroll-text'
      ]
    }
  }
})
