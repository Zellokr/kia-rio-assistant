<script setup lang="ts">
import { computed } from 'vue'

import { assertNever } from '~/utils/assertNever'
import {
  CONFIDENCE_LABELS,
  SEVERITY_LABELS
} from '~/utils/warningLightLabels'
import type {
  DiagnosticAssessment
} from '~~/core/obd/diagnostics/assessDiagnostics'
import type { DiagnosticSeverity } from '~~/core/obd/diagnostics/ports'
import type {
  DtcReadOutcome
} from '~~/core/obd/usecases/readDiagnosticCodes'

const props = defineProps<{
  assessment: DiagnosticAssessment | undefined
  reads: readonly DtcReadOutcome[]
}>()

const STATE_LABELS = {
  stored: 'almacenados',
  pending: 'pendientes',
  permanent: 'permanentes'
} as const

const SEVERITY_COLORS = {
  critical: 'error',
  warning: 'warning',
  info: 'neutral'
} as const satisfies Record<DiagnosticSeverity, string>

interface ReadLine {
  readonly key: string
  readonly heading: string
  readonly detail: string
  readonly codes: readonly string[]
}

/**
 * One line per read, worded so the three outcomes can never be mistaken
 * for each other.
 *
 * "Sin códigos" is reserved for a frame the vehicle actually answered.
 * A read the vehicle ignored says "sin confirmar", and a read that never
 * completed says it failed — because a driver who sees "sin códigos"
 * after a silent adapter would reasonably conclude the car is fine.
 */
const readLines = computed<ReadLine[]>(() =>
  props.reads.map((read, index) => {
    const label = STATE_LABELS[read.state]
    const key = `${read.state}:${index}`

    switch (read.kind) {
      case 'codes':
        return {
          key,
          heading: `Códigos ${label}`,
          detail: read.complete
            ? `${read.codes.length} código(s) leído(s)`
            : 'Lectura incompleta: puede haber más códigos de los '
              + 'que se muestran',
          codes: read.codes.map(code => code.code)
        }
      case 'no-codes-reported':
        return {
          key,
          heading: `Códigos ${label}`,
          detail: `El vehículo respondió sin códigos ${label}`,
          codes: []
        }
      case 'unconfirmed':
        return {
          key,
          heading: `Códigos ${label}`,
          detail: read.reason === 'no-data'
            ? `Sin confirmar: el vehículo no respondió a la lectura de `
            + `códigos ${label}`
            : `Sin confirmar: este vehículo no admite la lectura de `
              + `códigos ${label}`,
          codes: []
        }
      case 'failed':
        return {
          key,
          heading: `Códigos ${label}`,
          detail: `La lectura falló, así que no se ha descartado nada`,
          codes: []
        }
      default:
        return assertNever(read, 'DtcReadOutcome')
    }
  })
)
</script>

<template>
  <UCard>
    <div
      v-if="props.assessment === undefined"
      class="flex flex-col gap-2"
    >
      <h2 class="text-lg font-semibold text-highlighted">
        Diagnóstico local
      </h2>
      <p class="text-sm leading-6 text-muted">
        Todavía no se ha leído ningún código. Los resultados se evalúan
        con el catálogo local, sin enviar nada fuera del dispositivo.
      </p>
    </div>

    <div
      v-else
      class="flex flex-col gap-4"
    >
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold text-highlighted">
          Diagnóstico local
        </h2>
        <UBadge
          :color="SEVERITY_COLORS[props.assessment.severity]"
          variant="subtle"
        >
          {{ SEVERITY_LABELS[props.assessment.severity] }}
        </UBadge>
        <UBadge
          color="neutral"
          variant="soft"
        >
          {{ CONFIDENCE_LABELS[props.assessment.confidence] }}
        </UBadge>
      </div>

      <p class="text-sm leading-6 text-toned">
        {{ props.assessment.immediateAction }}
      </p>

      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-highlighted">
          Lecturas realizadas
        </h3>
        <ul class="flex flex-col gap-2 text-sm leading-6 text-muted">
          <li
            v-for="line in readLines"
            :key="line.key"
          >
            <span class="font-medium text-toned">
              {{ line.heading }}:
            </span>
            {{ line.detail }}
            <span
              v-if="line.codes.length > 0"
              class="mt-1 flex flex-wrap gap-1"
            >
              <UBadge
                v-for="code in line.codes"
                :key="code"
                color="neutral"
                variant="soft"
              >
                {{ code }}
              </UBadge>
            </span>
          </li>
        </ul>
      </section>

      <section
        v-if="props.assessment.possibleCauses.length > 0"
        class="flex flex-col gap-2"
      >
        <h3 class="text-sm font-semibold text-highlighted">
          Causas posibles
        </h3>
        <ul class="list-disc pl-5 text-sm leading-6 text-muted">
          <li
            v-for="cause in props.assessment.possibleCauses"
            :key="cause"
          >
            {{ cause }}
          </li>
        </ul>
      </section>

      <!--
        Restored with §8.2's `recommendedChecks`. The field was missing from
        the assessment entirely, so the catalogue's suggested checks were
        collected and then dropped on the floor.
      -->
      <section
        v-if="props.assessment.recommendedChecks.length > 0"
        class="flex flex-col gap-2"
      >
        <h3 class="text-sm font-semibold text-highlighted">
          Qué conviene revisar
        </h3>
        <ul class="list-disc pl-5 text-sm leading-6 text-muted">
          <li
            v-for="check in props.assessment.recommendedChecks"
            :key="check"
          >
            {{ check }}
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-highlighted">
          En qué se basa
        </h3>
        <ul class="list-disc pl-5 text-sm leading-6 text-muted">
          <li
            v-for="item in props.assessment.evidence"
            :key="`${item.type}:${item.description}`"
          >
            {{ item.description }}
          </li>
        </ul>
      </section>

      <section
        v-if="props.assessment.limitations.length > 0"
        class="flex flex-col gap-2"
      >
        <h3 class="text-sm font-semibold text-highlighted">
          Límites de este resultado
        </h3>
        <ul class="list-disc pl-5 text-sm leading-6 text-muted">
          <li
            v-for="limitation in props.assessment.limitations"
            :key="limitation"
          >
            {{ limitation }}
          </li>
        </ul>
      </section>
    </div>
  </UCard>
</template>
