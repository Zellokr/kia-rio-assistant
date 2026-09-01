<script setup lang="ts">
import { computed, ref, watch } from 'vue'

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
  reportStatus?: string
}>()

type DtcReadAction = 'stored' | 'pending' | 'permanent'

const activeReadAction = ref<DtcReadAction | undefined>()
const readsDisabled = computed(() => props.busy)
const busyLabel = computed(() => {
  switch (activeReadAction.value) {
    case 'stored':
      return 'Leyendo códigos almacenados…'
    case 'pending':
      return 'Leyendo códigos pendientes…'
    case 'permanent':
      return 'Leyendo códigos permanentes…'
    default:
      return 'Leyendo códigos…'
  }
})

watch(() => props.busy, (busy) => {
  if (!busy) {
    activeReadAction.value = undefined
  }
})

const emit = defineEmits<{
  'back-to-connection': []
  'readStored': []
  'readPending': []
  'readPermanent': []
  'reset': []
  'copy-report': []
}>()

function readCodes(action: DtcReadAction): void {
  activeReadAction.value = action

  switch (action) {
    case 'stored':
      emit('readStored')
      break
    case 'pending':
      emit('readPending')
      break
    case 'permanent':
      emit('readPermanent')
      break
  }
}
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
            :loading="props.busy && activeReadAction === 'stored'"
            @click="readCodes('stored')"
          >
            Códigos almacenados
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            size="lg"
            :disabled="readsDisabled"
            :loading="props.busy && activeReadAction === 'pending'"
            @click="readCodes('pending')"
          >
            Códigos pendientes
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            size="lg"
            :disabled="readsDisabled"
            :loading="props.busy && activeReadAction === 'permanent'"
            @click="readCodes('permanent')"
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

        <p
          v-if="props.busy"
          class="text-sm font-medium text-primary"
          role="status"
          aria-live="polite"
        >
          {{ busyLabel }}
        </p>

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

    <!--
      RF-037, and deliberately outside the connection gate above.
      A workshop report is read after the session, usually with the adapter
      already unplugged; gating it behind a live connection would remove it
      at exactly the moment it is wanted.

      Copied rather than downloaded: an `<a download>` over a blob URL is
      ignored by this Android WebView, which is why the log view's download
      button was removed on 2026-08-28.
    -->
    <div class="flex flex-col gap-2">
      <UButton
        color="neutral"
        variant="subtle"
        size="lg"
        icon="i-lucide-clipboard-list"
        class="justify-center"
        @click="emit('copy-report')"
      >
        Copiar informe para el taller
      </UButton>

      <p
        v-if="props.reportStatus"
        class="text-sm text-muted"
        role="status"
        aria-live="polite"
      >
        {{ props.reportStatus }}
      </p>
    </div>
  </section>
</template>
