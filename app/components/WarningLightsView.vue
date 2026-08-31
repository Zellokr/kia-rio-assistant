<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import WarningLightIdentifier from './WarningLightIdentifier.vue'
import {
  saeGenericDtcCatalog
} from '~~/catalog/dtc-sae-generic'
import {
  associateLightsWithDtc
} from '~~/core/obd/diagnostics/association'
import type {
  DtcExplanation,
  WarningLightCatalog
} from '~~/core/obd/diagnostics/ports'
import type { DtcObservation } from '~~/core/obd/dtc/DtcCode'
import type {
  DtcReadOutcome
} from '~~/core/obd/usecases/readDiagnosticCodes'

const props = defineProps<{
  catalog: WarningLightCatalog
  adapterConnected: boolean
  reads: readonly DtcReadOutcome[]
}>()

const selectedObservationKey = ref<string | undefined>()

const STATE_LABELS = {
  stored: 'almacenado',
  pending: 'pendiente',
  permanent: 'permanente'
} as const

interface SessionDtcEvidence {
  readonly key: string
  readonly observation: DtcObservation
  readonly explanation: DtcExplanation
  readonly associatedLightNames: readonly string[]
}

const sessionDtcEvidence = computed<SessionDtcEvidence[]>(() =>
  props.reads.flatMap((read) => {
    if (read.kind !== 'codes') {
      return []
    }

    return read.codes.map((code, index) => {
      const observation: DtcObservation = {
        ...code,
        state: read.state,
        observedAt: 'session'
      }
      const explanation = saeGenericDtcCatalog.lookup(code)
      const associatedLightNames = associateLightsWithDtc(
        props.catalog,
        observation,
        explanation
      ).map(association =>
        props.catalog.byId(association.lightId)?.name
      ).filter((name): name is string => name !== undefined)

      return {
        key: `${read.state}:${code.code}:${index}`,
        observation,
        explanation,
        associatedLightNames
      }
    })
  })
)

const selectedEvidence = computed(() =>
  sessionDtcEvidence.value.find(
    evidence => evidence.key === selectedObservationKey.value
  ) ?? sessionDtcEvidence.value[0]
)

watch(
  sessionDtcEvidence,
  (evidence) => {
    if (evidence.length === 0) {
      selectedObservationKey.value = undefined
      return
    }

    if (!evidence.some(item => item.key === selectedObservationKey.value)) {
      selectedObservationKey.value = evidence[0]!.key
    }
  },
  { immediate: true }
)
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

    <UCard>
      <div class="flex flex-col gap-4">
        <div class="flex items-start gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UIcon
              name="i-lucide-search-check"
              class="size-5"
              aria-hidden="true"
            />
          </span>
          <div class="flex flex-col gap-1">
            <h2 class="font-semibold text-highlighted">
              Guía visual primero
            </h2>
            <p class="text-sm leading-6 text-muted">
              Puedes identificar un testigo sin conectar el adaptador. Si conectas
              el Veepeak y lees averías, esta vista puede cruzar la luz con los
              códigos detectados en esta sesión.
            </p>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h2 class="font-semibold text-highlighted">
            Evidencia OBD de esta sesión
          </h2>
          <p class="text-sm leading-6 text-muted">
            Esta sección no lee el vehículo. Solo resume los DTC que ya se hayan
            leído en Averías y los usa como contexto orientativo.
          </p>
        </div>

        <UAlert
          v-if="sessionDtcEvidence.length === 0"
          color="neutral"
          variant="soft"
          icon="i-lucide-info"
          title="Sin códigos leídos todavía"
          description="Puedes usar la guía visual sin conectar el adaptador, o ir a Averías para leer DTC antes de cruzarlos con un testigo."
        />

        <div
          v-else
          class="flex flex-col gap-3"
        >
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="evidence in sessionDtcEvidence"
              :key="evidence.key"
              :color="selectedEvidence?.key === evidence.key ? 'primary' : 'neutral'"
              :variant="selectedEvidence?.key === evidence.key ? 'soft' : 'ghost'"
              :aria-pressed="selectedEvidence?.key === evidence.key"
              :aria-current="selectedEvidence?.key === evidence.key ? 'true' : undefined"
              size="sm"
              @click="selectedObservationKey = evidence.key"
            >
              {{ evidence.observation.code }} · {{ STATE_LABELS[evidence.observation.state] }}
            </UButton>
          </div>

          <div class="rounded-xl border border-default bg-muted/40 p-4">
            <p class="text-sm font-medium text-highlighted">
              Relación orientativa
            </p>
            <p class="mt-1 text-sm leading-6 text-muted">
              El código {{ selectedEvidence?.observation.code }} puede ayudar a
              acotar los testigos compatibles, pero no demuestra causalidad por
              sí solo.
            </p>
            <p
              v-if="selectedEvidence?.associatedLightNames.length"
              class="mt-3 text-sm text-muted"
            >
              Coincidencias declaradas en el catálogo:
              <span class="font-medium text-highlighted">
                {{ selectedEvidence.associatedLightNames.join(', ') }}
              </span>
            </p>
            <p
              v-else
              class="mt-3 text-sm text-muted"
            >
              No hay una relación declarada entre este DTC y un testigo del
              catálogo local. La guía visual seguirá sin forzar una coincidencia.
            </p>
          </div>
        </div>
      </div>
    </UCard>

    <WarningLightIdentifier
      :catalog="props.catalog"
      :adapter-connected="props.adapterConnected"
      :dtc-observation="selectedEvidence?.observation"
      :dtc-explanation="selectedEvidence?.explanation"
    />
  </section>
</template>
