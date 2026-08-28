<script setup lang="ts">
import { computed } from 'vue'

import type { NuxtError } from '#app'

/**
 * The screen a driver sees when something failed outside any page's control.
 *
 * Without this file Nuxt renders its own error page: the application shell is
 * gone, the wording is in English, and the only way back is the browser's own
 * navigation — which, inside the Android shell, is not on screen. So the app
 * would look like it had crashed even when only one route had.
 *
 * It stays deliberately plain. Whatever failed may have been the OBD session
 * itself, so this page talks to no adapter and reads no session state; it
 * offers the one action that is always safe, which is going back to the lab.
 */
const props = defineProps<{
  error: NuxtError
}>()

const isNotFound = computed(() => props.error.statusCode === 404)

const title = computed(() => (
  isNotFound.value
    ? 'Esta página no existe'
    : 'Algo ha fallado'
))

const description = computed(() => (
  isNotFound.value
    ? 'La dirección que has abierto no corresponde a ninguna sección de la aplicación.'
    : 'La aplicación no ha podido continuar. No se ha enviado nada al vehículo.'
))

function backToLab(): void {
  clearError({ redirect: '/' })
}
</script>

<template>
  <UApp>
    <NuxtLayout>
      <UContainer class="flex max-w-xl flex-col items-center gap-6 py-16 text-center">
        <span class="flex size-16 items-center justify-center rounded-full bg-elevated text-muted">
          <UIcon
            :name="isNotFound ? 'i-lucide-map-pin-off' : 'i-lucide-triangle-alert'"
            class="size-8"
            aria-hidden="true"
          />
        </span>

        <div class="flex flex-col gap-2">
          <h1 class="text-2xl font-bold tracking-tight text-highlighted">
            {{ title }}
          </h1>
          <p class="text-sm leading-6 text-muted">
            {{ description }}
          </p>
        </div>

        <!--
          The raw message is shown because this application is also a
          diagnostic tool: the person holding the phone is the person who
          reports the fault, and a hidden message is one they cannot report.
        -->
        <p
          v-if="error.message && !isNotFound"
          class="w-full break-words rounded-lg border border-default bg-default px-4 py-3 text-left font-mono text-xs text-muted"
        >
          {{ error.message }}
        </p>

        <UButton
          color="primary"
          size="lg"
          icon="i-lucide-arrow-left"
          class="min-h-12"
          @click="backToLab"
        >
          Volver al laboratorio
        </UButton>
      </UContainer>
    </NuxtLayout>
  </UApp>
</template>
