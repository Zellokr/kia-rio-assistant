import type { ObdPersistence } from '~~/data/repositories/createObdPersistence'

/**
 * Puts a persistence adapter where `useObdSessionRecording` looks for it.
 *
 * The client plugin provides `$obdPersistence` on the Nuxt app, and the
 * recording composable reads it straight off `useNuxtApp()`. Under the real
 * Nuxt test environment there is a real app instance, so a test injects by
 * setting the same property the plugin sets rather than by standing in for
 * `useNuxtApp` itself.
 *
 * `nuxtApp.provide` is deliberately not used: it refuses a key that is
 * already present, and these tests inject a fresh adapter per case.
 */
export function provideObdPersistence(
  nuxtApp: unknown,
  persistence: ObdPersistence | undefined
): void {
  (nuxtApp as Record<string, unknown>).$obdPersistence = persistence
}
