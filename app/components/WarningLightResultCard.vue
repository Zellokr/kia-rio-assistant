<script setup lang="ts">
import { computed } from 'vue'

import { assertNever } from '~/utils/assertNever'
import {
  CONFIDENCE_LABELS,
  SEVERITY_LABELS
} from '~/utils/warningLightLabels'
import type {
  WarningLightIdentification
} from '~~/core/obd/diagnostics/identifyWarningLight'
import type { DiagnosticSeverity } from '~~/core/obd/diagnostics/ports'

const props = defineProps<{
  identification: WarningLightIdentification
}>()

/**
 * The exhaustive switch RF-026 asks for.
 *
 * It is a computed rather than a comment, so it runs during render: an
 * outcome this build does not know throws instead of quietly producing an
 * empty card at somebody standing next to a car with a light on. The
 * compiler catches a missing branch at build time; this catches a payload
 * that arrives from a future version of the engine at runtime.
 */
const outcome = computed<WarningLightIdentification>(() => {
  const identification = props.identification

  switch (identification.kind) {
    case 'match':
    case 'candidates':
    case 'unidentified':
      return identification
    default:
      return assertNever(
        identification,
        'WarningLightIdentification'
      )
  }
})

/**
 * `as const` keeps the values as literals rather than widening to
 * `string`, so they stay assignable to the badge's own colour union and a
 * typo becomes a build error instead of a runtime surprise.
 */
const SEVERITY_COLORS = {
  critical: 'error',
  warning: 'warning',
  info: 'neutral'
} as const satisfies Record<DiagnosticSeverity, string>
</script>

<template>
  <UCard>
    <div
      v-if="outcome.kind === 'match'"
      class="flex flex-col gap-4"
    >
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold text-highlighted">
          {{ outcome.light.name }}
        </h2>
        <UBadge
          :color="SEVERITY_COLORS[outcome.light.severity]"
          variant="subtle"
        >
          {{ SEVERITY_LABELS[outcome.light.severity] }}
        </UBadge>
        <UBadge
          color="neutral"
          variant="soft"
        >
          {{ CONFIDENCE_LABELS[outcome.confidence] }}
        </UBadge>
      </div>

      <p class="text-sm leading-6 text-toned">
        {{ outcome.light.immediateAction }}
      </p>

      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-highlighted">
          Qué comprobar
        </h3>
        <ul class="list-disc pl-5 text-sm leading-6 text-muted">
          <li
            v-for="check in outcome.light.recommendedChecks"
            :key="check"
          >
            {{ check }}
          </li>
        </ul>
      </section>

      <section
        v-if="outcome.limitations.length > 0"
        class="flex flex-col gap-2"
      >
        <h3 class="text-sm font-semibold text-highlighted">
          Límites de este resultado
        </h3>
        <ul class="list-disc pl-5 text-sm leading-6 text-muted">
          <li
            v-for="limitation in outcome.limitations"
            :key="limitation"
          >
            {{ limitation }}
          </li>
        </ul>
      </section>
    </div>

    <div
      v-else-if="outcome.kind === 'candidates'"
      class="flex flex-col gap-4"
    >
      <h2 class="text-lg font-semibold text-highlighted">
        Todavía hay varios testigos posibles
      </h2>
      <ul class="list-disc pl-5 text-sm leading-6 text-toned">
        <li
          v-for="candidate in outcome.candidates"
          :key="candidate.id"
        >
          {{ candidate.name }}
        </li>
      </ul>
    </div>

    <div
      v-else
      class="flex flex-col gap-4"
    >
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold text-highlighted">
          Testigo sin identificar
        </h2>
        <UBadge
          :color="SEVERITY_COLORS[outcome.safeAlternative.severityFloor]"
          variant="subtle"
        >
          {{ SEVERITY_LABELS[outcome.safeAlternative.severityFloor] }}
        </UBadge>
      </div>

      <p class="text-sm leading-6 text-toned">
        {{ outcome.safeAlternative.immediateAction }}
      </p>

      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-highlighted">
          Qué comprobar
        </h3>
        <ul class="list-disc pl-5 text-sm leading-6 text-muted">
          <li
            v-for="check in outcome.safeAlternative.recommendedChecks"
            :key="check"
          >
            {{ check }}
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-highlighted">
          Límites de este resultado
        </h3>
        <ul class="list-disc pl-5 text-sm leading-6 text-muted">
          <li
            v-for="limitation in outcome.safeAlternative.limitations"
            :key="limitation"
          >
            {{ limitation }}
          </li>
        </ul>
      </section>
    </div>
  </UCard>
</template>
