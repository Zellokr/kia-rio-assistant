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

  runtimeConfig: {
    public: {
      telegram: {
        enabled: process.env.FIELD_TEST_TELEGRAM === '1',
        botToken: process.env.FIELD_TEST_TELEGRAM === '1'
          ? process.env.TELEGRAM_BOT_TOKEN ?? ''
          : '',
        chatId: process.env.FIELD_TEST_TELEGRAM === '1'
          ? process.env.TELEGRAM_CHAT_ID ?? ''
          : ''
      },
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
   * TEMPORARY — field-test evidence delivery. See
   * `app/services/telegramFieldLog.ts`.
   *
   * The token reaches the bundle ONLY when the build is asked for it:
   *
   *     FIELD_TEST_TELEGRAM=1 \
   *     TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... \
   *     pnpm android:build:debug
   *
   * Without `FIELD_TEST_TELEGRAM`, `enabled` is false, both strings are
   * empty, and the sender is never imported — so no secret exists in an
   * ordinary build to be extracted from it. `AGENTS.MD` forbids secrets in
   * the client, and a flag that has to be remembered is not a guarantee.
   */
  vite: {
    define: {
      /**
       * Folded to a literal at build time so the bundler can delete the
       * branch that imports the sender. A runtime boolean only stops it
       * executing — the chunk still ships, which is what
       * `scripts/assert-no-field-test-secrets.mjs` caught.
       */
      __FIELD_TEST_TELEGRAM__: JSON.stringify(
        process.env.FIELD_TEST_TELEGRAM === '1'
      )
    }
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
