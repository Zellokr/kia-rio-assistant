<script setup lang="ts">
import WarningLightIdentifier from './WarningLightIdentifier.vue'
import type { WarningLightCatalog } from '~~/core/obd/diagnostics/ports'

const props = defineProps<{
  catalog: WarningLightCatalog
  adapterConnected: boolean
}>()
</script>

<template>
  <section
    class="flex flex-col gap-4"
    aria-labelledby="warning-lights-view-title"
  >
    <div class="flex flex-col gap-1 px-1">
      <p class="text-sm font-medium text-primary">
        Asistencia visual
      </p>
      <h1
        id="warning-lights-view-title"
        class="text-2xl font-bold tracking-tight text-highlighted"
      >
        Testigos del cuadro
      </h1>
      <p class="text-sm text-muted">
        Identifica una luz del cuadro sin asumir un diagnóstico no confirmado.
      </p>
    </div>

    <WarningLightIdentifier
      :catalog="props.catalog"
      :adapter-connected="props.adapterConnected"
    />
  </section>
</template>
