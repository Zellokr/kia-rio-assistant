// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/test-utils/module'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark'
  },

  routeRules: {
    '/': { prerender: true },
    '/lab': { prerender: true }
  },

  compatibilityDate: '2026-06-30',

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
      icons: ['lucide:plug-zap', 'lucide:gauge', 'lucide:scroll-text']
    }
  }
})
