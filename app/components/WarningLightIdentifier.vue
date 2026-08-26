<script setup lang="ts">
import { computed, ref } from 'vue'

import WarningLightQuestionStep from './WarningLightQuestionStep.vue'
import type { QuestionOption } from './WarningLightQuestionStep.vue'
import WarningLightResultCard from './WarningLightResultCard.vue'
import {
  LIGHT_BEHAVIOR_LABELS,
  LIGHT_COLOR_LABELS,
  shapeLabel
} from '~/utils/warningLightLabels'
import {
  associateLightsWithDtc
} from '~~/core/obd/diagnostics/association'
import {
  identifyWarningLight
} from '~~/core/obd/diagnostics/identifyWarningLight'
import type {
  LightAnswers,
  LightQuestion
} from '~~/core/obd/diagnostics/identifyWarningLight'
import type {
  DtcExplanation,
  WarningLightCatalog,
  WarningLightEntry
} from '~~/core/obd/diagnostics/ports'
import type { DtcObservation } from '~~/core/obd/dtc/DtcCode'

const props = defineProps<{
  catalog: WarningLightCatalog
  adapterConnected: boolean
  /** RF-024 entry path (b): start from a DTC already read this session. */
  dtcObservation?: DtcObservation
  dtcExplanation?: DtcExplanation
}>()

const answers = ref<LightAnswers>({})

/**
 * Entry path (b) narrows the catalogue before a single question is asked,
 * and it narrows it by association — a light the catalogue declares
 * compatible with this code, never one that merely sounds related. When
 * nothing is declared, the flow starts with an empty set and honestly
 * reports that it could not identify the light.
 */
const scopedCatalog = computed<WarningLightCatalog>(() => {
  const observation = props.dtcObservation

  if (observation === undefined) {
    return props.catalog
  }

  const associated = new Set(
    associateLightsWithDtc(
      props.catalog,
      observation,
      props.dtcExplanation
    ).map(association => association.lightId)
  )

  const entries = props.catalog
    .all()
    .filter(entry => associated.has(entry.id))

  return {
    all: () => entries,
    byId: id => entries.find(entry => entry.id === id)
  }
})

const identification = computed(() =>
  identifyWarningLight(
    {
      answers: answers.value,
      adapterConnected: props.adapterConnected
    },
    scopedCatalog.value
  )
)

const step = computed(() => {
  const current = identification.value

  if (current.kind !== 'candidates') {
    return undefined
  }

  const question = current.nextQuestion

  return question === undefined
    ? undefined
    : {
        question,
        options: optionsFor(question, current.candidates)
      }
})

/**
 * Options come from the candidates still standing, so the flow never
 * offers an answer that would empty the set. Questions whose answers are
 * free text return none, and the step renders an input instead.
 */
function optionsFor(
  question: LightQuestion,
  candidates: readonly WarningLightEntry[]
): QuestionOption[] {
  switch (question) {
    case 'color':
      return unique(
        candidates.map(entry => entry.color)
      ).map(color => ({
        value: color,
        label: LIGHT_COLOR_LABELS[color]
      }))
    case 'shape':
      return unique(
        candidates.map(entry => entry.shape)
      ).map(shape => ({
        value: shape,
        label: shapeLabel(shape)
      }))
    case 'behavior':
      return unique(
        candidates.flatMap(entry => entry.behavior)
      ).map(behavior => ({
        value: behavior,
        label: LIGHT_BEHAVIOR_LABELS[behavior]
      }))
    case 'displayText':
    case 'symptoms':
      return []
  }
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function recordAnswer(question: LightQuestion, value: string): void {
  answers.value = {
    ...answers.value,
    [question]: question === 'symptoms' ? [value] : value
  }
}

function optOut(): void {
  answers.value = { ...answers.value, optedOut: true }
}
</script>

<template>
  <section
    class="flex flex-col gap-4"
    aria-label="Identificación de testigos del cuadro"
  >
    <WarningLightQuestionStep
      v-if="step"
      :question="step.question"
      :options="step.options"
      @answer="value => recordAnswer(step!.question, value)"
      @opt-out="optOut"
    />

    <WarningLightResultCard :identification="identification" />
  </section>
</template>
