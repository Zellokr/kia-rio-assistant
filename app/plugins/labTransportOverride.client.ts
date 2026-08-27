import {
  labTransportFactoryKey,
  shouldUseDevMockTransport
} from '~/utils/labTransportFactory'

/**
 * Gives a development browser a mock adapter, so the lab page picks it up
 * through `inject(labTransportFactoryKey, …)`.
 *
 * The bare `import.meta.dev` check comes first and stays first. It folds to
 * a constant at build time, which lets the bundler drop everything below it
 * — including the dynamic import — so a production build ships no mock
 * adapter at all. Verified by grepping the generated bundle, not assumed.
 *
 * Whether the URL asked is decided by `shouldUseDevMockTransport`, which is
 * unit tested. Providing nothing leaves the page on its own default.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  if (!import.meta.dev) {
    return
  }

  if (!shouldUseDevMockTransport(window.location.search, import.meta.dev)) {
    return
  }

  const { MockObdTransport } = await import(
    '~~/core/obd/transport/MockObdTransport'
  )

  nuxtApp.vueApp.provide(labTransportFactoryKey, () => new MockObdTransport())
})
