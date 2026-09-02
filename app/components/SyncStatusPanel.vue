<script setup lang="ts">
import { computed } from 'vue'

import { useConvexSync } from '~/composables/useConvexSync'

/**
 * What is still owed to Convex, and what the last attempt did.
 *
 * The count is the honest part. §15.2 requires the app to keep operations
 * offline and retry without duplicating them, and a driver who cannot see
 * that anything is pending has no way to tell a synced history from a stalled
 * one. A silent queue that never drains looks exactly like a queue with
 * nothing in it.
 */

const { pending, draining, lastReport, drain, available } = useConvexSync()

const summary = computed(() => {
  const report = lastReport.value

  if (!report) {
    return ''
  }

  if (report.outcome === 'empty') {
    return 'No había nada pendiente.'
  }

  if (report.outcome === 'failed') {
    return `No se pudo sincronizar: ${report.message}. `
      + 'Nada se ha perdido; sigue en la cola.'
  }

  const dropped = report.dropped > 0
    ? ` ${report.dropped} se descartaron porque su registro ya no existe.`
    : ''

  return `Se sincronizaron ${report.accepted} de ${report.pushed}.${dropped}`
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="min-w-0">
        <h2 class="font-semibold text-highlighted">
          Sincronización
        </h2>
        <p class="text-sm leading-6 text-muted">
          Sesiones y mantenimientos viajan a Convex cuando hay conexión. Sin
          ella se quedan en cola y no se pierde nada.
        </p>
      </div>
    </template>

    <div class="flex flex-col gap-3">
      <p class="text-sm text-highlighted">
        <template v-if="pending === 0">
          No hay nada pendiente de sincronizar.
        </template>
        <template v-else>
          {{ pending }} {{ pending === 1 ? 'operación pendiente' : 'operaciones pendientes' }}.
        </template>
      </p>

      <UButton
        color="neutral"
        variant="subtle"
        class="justify-center"
        :loading="draining"
        :disabled="draining || !available"
        @click="drain()"
      >
        Sincronizar ahora
      </UButton>

      <p
        v-if="summary"
        class="text-sm text-muted"
        role="status"
        aria-live="polite"
      >
        {{ summary }}
      </p>
    </div>
  </UCard>
</template>
