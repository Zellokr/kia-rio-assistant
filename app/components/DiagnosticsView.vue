<script setup lang="ts">
import { computed } from 'vue'

import DiagnosticAssessmentCard from './DiagnosticAssessmentCard.vue'
import type {
  DiagnosticAssessment
} from '~~/core/obd/diagnostics/assessDiagnostics'
import type {
  DtcReadOutcome
} from '~~/core/obd/usecases/readDiagnosticCodes'

const props = defineProps<{
  busy: boolean
  adapterConnected: boolean
  errorMessage: string
  assessment: DiagnosticAssessment | undefined
  reads: readonly DtcReadOutcome[]
}>()

const readsDisabled = computed(() => props.busy)

const emit = defineEmits<{
  'back-to-connection': []
  'readStored': []
  'readPending': []
  'readPermanent': []
  'reset': []
}>()
</script>

<template>
  <section
    class="flex flex-col gap-4"
    aria-labelledby="diagnostics-view-title"
  >
    <div class="flex flex-col gap-1 px-1">
      <p class="text-sm font-medium text-primary">
        Diagnóstico local
      </p>
      <h1
        id="diagnostics-view-title"
        class="text-2xl font-bold tracking-tight text-highlighted"
      >
        Códigos de avería
      </h1>
      <p class="text-sm text-muted">
        Lee DTC almacenados, pendientes y permanentes sin borrar nada de la ECU.
      </p>
    </div>

    <UCard v-if="!props.adapterConnected">
      <div class="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
        <span class="flex size-14 items-center justify-center rounded-full bg-elevated text-muted">
          <UIcon
            name="i-lucide-plug"
            class="size-7"
            aria-hidden="true"
          />
        </span>
        <div class="flex max-w-sm flex-col gap-1">
          <h2 class="text-lg font-semibold text-highlighted">
            Primero prepara una conexión
          </h2>
          <p class="text-sm text-muted">
            Las lecturas de averías permanecerán bloqueadas hasta que la sesión esté preparada.
          </p>
        </div>
        <UButton
          color="primary"
          size="lg"
          icon="i-lucide-arrow-left"
          class="min-h-12 justify-center"
          @click="emit('back-to-connection')"
        >
          Ir a Conexión
        </UButton>
      </div>
    </UCard>

    <UCard v-else>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-lg font-semibold text-highlighted">
            Leer códigos de avería
          </h2>
          <p class="text-sm leading-6 text-muted">
            Lectura únicamente. Este laboratorio no borra códigos
            ni escribe nada en la centralita.
          </p>
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <UButton
            color="primary"
            variant="solid"
            size="lg"
            :disabled="readsDisabled"
            @click="emit('readStored')"
          >
            Códigos almacenados
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            size="lg"
            :disabled="readsDisabled"
            @click="emit('readPending')"
          >
            Códigos pendientes
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            size="lg"
            :disabled="readsDisabled"
            @click="emit('readPermanent')"
          >
            Códigos permanentes
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="lg"
            :disabled="props.busy"
            @click="emit('reset')"
          >
            Limpiar resultados
          </UButton>
        </div>

        <UAlert
          v-if="props.errorMessage"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :description="props.errorMessage"
        />
      </div>
    </UCard>

    <DiagnosticAssessmentCard
      :assessment="props.assessment"
      :reads="props.reads"
    />
  </section>
</template>
