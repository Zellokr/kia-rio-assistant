<script setup lang="ts">
import { ref } from 'vue'

import {
  LIGHT_QUESTION_LABELS
} from '~/utils/warningLightLabels'
import type { LightQuestion } from '~~/core/obd/diagnostics/identifyWarningLight'

export interface QuestionOption {
  value: string
  label: string
}

const props = defineProps<{
  question: LightQuestion
  options: readonly QuestionOption[]
}>()

const emit = defineEmits<{
  answer: [string]
  optOut: []
}>()

const freeText = ref('')

function submitFreeText(): void {
  const value = freeText.value.trim()

  if (value.length === 0) {
    return
  }

  emit('answer', value)
  freeText.value = ''
}
</script>

<template>
  <UCard>
    <div class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold text-highlighted">
        {{ LIGHT_QUESTION_LABELS[props.question] }}
      </h2>

      <div
        v-if="props.options.length > 0"
        class="grid gap-2 sm:grid-cols-2"
      >
        <UButton
          v-for="option in props.options"
          :key="option.value"
          color="neutral"
          variant="soft"
          size="lg"
          class="justify-start text-left"
          @click="emit('answer', option.value)"
        >
          {{ option.label }}
        </UButton>
      </div>

      <div
        v-else
        class="flex flex-col gap-2 sm:flex-row"
      >
        <UInput
          v-model="freeText"
          class="flex-1"
          :aria-label="LIGHT_QUESTION_LABELS[props.question]"
        />
        <UButton
          color="primary"
          variant="solid"
          size="lg"
          @click="submitFreeText"
        >
          Continuar
        </UButton>
      </div>

      <!--
        Always present, at every step. A flow that only offers this once
        the questions run out forces a guess out of a driver who does not
        have one.
      -->
      <UButton
        color="neutral"
        variant="ghost"
        size="lg"
        class="self-start"
        @click="emit('optOut')"
      >
        No identificado
      </UButton>
    </div>
  </UCard>
</template>
