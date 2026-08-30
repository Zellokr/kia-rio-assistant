<script setup lang="ts">
import type {
  AssistantAnswer,
  AssistantFallbackReason
} from '~~/core/assistant/resolveAssistantAnswer'

const props = defineProps<{
  answer: AssistantAnswer | null
  pending?: boolean
}>()

function sourceLabel(source: AssistantAnswer['source']): string {
  return source === 'ai'
    ? 'IA validada'
    : 'Fallback local'
}

function reasonLabel(reason: AssistantFallbackReason): string {
  switch (reason.kind) {
    case 'no-provider':
      return 'sin proveedor de IA configurado'
    case 'provider-failed':
      return 'falló el proveedor de IA'
    case 'provider-timed-out':
      return 'el proveedor de IA no respondió a tiempo'
    case 'empty':
      return 'respuesta vacía rechazada'
    case 'unknown-dtc':
      return `DTC no enviado rechazado: ${reason.codes.join(', ')}`
    case 'unknown-pid':
      return `PID no enviado rechazado: ${reason.pids.join(', ')}`
    case 'authorises-driving':
      return 'autorización de conducción rechazada'
    case 'downgrades-severity':
      return 'rebaja de gravedad rechazada'
    case 'promises-a-repair':
      return 'promesa de reparación rechazada'
  }
}
</script>

<template>
  <section
    v-if="pending || props.answer"
    class="rounded-xl border border-default bg-default/80 p-4"
    aria-live="polite"
    data-testid="assistant-answer"
  >
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <p class="text-sm font-semibold text-highlighted">
        Respuesta del asistente
      </p>

      <UBadge
        v-if="props.answer"
        color="neutral"
        variant="soft"
        data-testid="assistant-answer-source"
      >
        {{ sourceLabel(props.answer.source) }}
      </UBadge>
    </div>

    <p
      v-if="pending"
      class="text-sm text-muted"
    >
      Preparando una respuesta local…
    </p>

    <template v-else-if="props.answer">
      <p class="whitespace-pre-line text-sm text-default">
        {{ props.answer.text }}
      </p>

      <p
        v-if="props.answer.reasons.length > 0"
        class="mt-3 text-xs text-muted"
        data-testid="assistant-answer-reasons"
      >
        Motivo: {{ props.answer.reasons.map(reasonLabel).join('; ') }}.
      </p>
    </template>
  </section>
</template>
