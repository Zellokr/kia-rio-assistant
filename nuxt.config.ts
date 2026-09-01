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
   * The deployment URL arrives through `NUXT_PUBLIC_CONVEX_URL`, which the
   * module reads before falling back to `CONVEX_URL`. That URL is public by
   * design and is the only Convex value the client may ever hold: RNF-006
   * keeps every key server-side, and this APK is a static bundle that cannot
   * hide one.
   */
  convex: {},

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
