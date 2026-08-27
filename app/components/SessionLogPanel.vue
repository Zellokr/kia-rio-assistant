<script setup lang="ts">
import { computed, ref } from 'vue'

import type {
  ObdSessionEvent
} from '~~/core/obd/logging/ObdSessionLog'
import {
  filterSessionEvents,
  presentSessionEvent
} from '~/utils/obdSessionEventPresentation'
import type {
  SessionLogFilter
} from '~/utils/obdSessionEventPresentation'

const props = defineProps<{
  events: ObdSessionEvent[]
  droppedEvents: number
  truncated: boolean
  copyStatus?: string
}>()

const emit = defineEmits<{
  export: []
  copy: []
  clear: []
}>()

const DISPLAY_LIMIT = 200
const activeFilter = ref<SessionLogFilter>('all')

const filters: Array<{
  value: SessionLogFilter
  label: string
  icon: string
}> = [
  { value: 'all', label: 'Todos', icon: 'i-lucide-list' },
  { value: 'commands', label: 'Comandos', icon: 'i-lucide-terminal' },
  { value: 'errors', label: 'Errores', icon: 'i-lucide-circle-alert' }
]

const filteredEvents = computed(() => {
  return filterSessionEvents(props.events, activeFilter.value)
})

const visibleItems = computed(() => {
  return filteredEvents.value
    .slice(-DISPLAY_LIMIT)
    .reverse()
    .map(presentSessionEvent)
})

const hiddenByLimit = computed(() => {
  return Math.max(0, filteredEvents.value.length - DISPLAY_LIMIT)
})
</script>

<template>
  <section
    class="flex flex-col gap-4"
    aria-labelledby="session-log-title"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <h1
            id="session-log-title"
            class="text-2xl font-bold tracking-tight text-highlighted"
          >
            Actividad de la sesión
          </h1>
          <UBadge
            color="neutral"
            variant="outline"
          >
            {{ events.length }} actividades
          </UBadge>
          <UBadge
            v-if="truncated"
            color="warning"
            variant="soft"
          >
            {{ droppedEvents }} descartados
          </UBadge>
        </div>
        <p class="text-sm text-muted">
          Las actividades más recientes aparecen primero. Abre una para consultar
          los detalles técnicos, si los necesitas.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-2 sm:flex">
        <UButton
          color="primary"
          size="lg"
          icon="i-lucide-clipboard-copy"
          class="min-h-12 justify-center"
          @click="emit('copy')"
        >
          Copiar registro
        </UButton>
        <p
          v-if="props.copyStatus"
          class="col-span-2 text-sm text-muted sm:order-last sm:w-full"
          role="status"
        >
          {{ props.copyStatus }}
        </p>
        <UButton
          color="primary"
          variant="soft"
          size="lg"
          icon="i-lucide-download"
          class="min-h-12 justify-center"
          @click="emit('export')"
        >
          Exportar
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="lg"
          icon="i-lucide-trash-2"
          class="min-h-12 justify-center"
          @click="emit('clear')"
        >
          Limpiar vista
        </UButton>
      </div>
    </div>

    <div
      class="grid grid-cols-3 gap-2 rounded-xl border border-default bg-default p-2"
      role="group"
      aria-label="Filtrar registro"
    >
      <UButton
        v-for="filter in filters"
        :key="filter.value"
        :color="activeFilter === filter.value ? 'primary' : 'neutral'"
        :variant="activeFilter === filter.value ? 'soft' : 'ghost'"
        :icon="filter.icon"
        size="lg"
        class="min-h-12 justify-center px-2"
        @click="activeFilter = filter.value"
      >
        {{ filter.label }}
      </UButton>
    </div>

    <UAlert
      v-if="hiddenByLimit > 0"
      color="neutral"
      variant="soft"
      icon="i-lucide-info"
      title="Vista optimizada para móvil"
      :description="`Se muestran los 200 eventos más recientes. Hay ${hiddenByLimit} anteriores disponibles en el JSON exportado.`"
    />

    <UCard v-if="visibleItems.length === 0">
      <div class="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
        <span class="flex size-12 items-center justify-center rounded-full bg-elevated text-muted">
          <UIcon
            name="i-lucide-inbox"
            class="size-6"
            aria-hidden="true"
          />
        </span>
        <div class="flex max-w-sm flex-col gap-1">
          <h2 class="font-semibold text-highlighted">
            No hay actividad para mostrar
          </h2>
          <p class="text-sm text-muted">
            Las acciones, respuestas y errores aparecerán aquí durante la sesión.
          </p>
        </div>
      </div>
    </UCard>

    <ol
      v-else
      class="flex flex-col gap-2"
      aria-label="Eventos de la sesión"
    >
      <li
        v-for="item in visibleItems"
        :key="item.id"
      >
        <details class="group rounded-xl border border-default bg-default open:border-primary/40">
          <summary class="flex min-h-20 cursor-pointer list-none items-start gap-3 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <span
              class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg"
              :class="{
                'bg-error/10 text-error': item.tone === 'error',
                'bg-warning/10 text-warning': item.tone === 'warning',
                'bg-success/10 text-success': item.tone === 'success',
                'bg-primary/10 text-primary': item.tone === 'primary',
                'bg-elevated text-muted': item.tone === 'neutral'
              }"
            >
              <UIcon
                :name="item.icon"
                class="size-5"
                aria-hidden="true"
              />
            </span>

            <span class="min-w-0 flex-1">
              <span class="flex items-start justify-between gap-3">
                <span class="font-semibold text-highlighted">{{ item.title }}</span>
                <span class="shrink-0 font-mono text-xs tabular-nums text-muted">{{ item.meta }}</span>
              </span>
              <span class="mt-1 line-clamp-2 block break-words text-sm text-muted">
                {{ item.summary }}
              </span>
            </span>

            <UIcon
              name="i-lucide-chevron-down"
              class="mt-2 size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>

          <div class="flex flex-col gap-3 border-t border-default px-4 pb-4 pt-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div
                v-if="item.rawText"
                class="flex min-w-0 flex-col gap-1"
              >
                <span class="text-xs font-medium uppercase tracking-wide text-terminal-muted">Raw</span>
                <pre class="overflow-auto whitespace-pre-wrap break-words rounded-lg border border-terminal-border bg-terminal p-3 font-mono text-xs leading-5 text-terminal-foreground">{{ item.rawText }}</pre>
              </div>
              <div
                v-if="item.normalizedText"
                class="flex min-w-0 flex-col gap-1"
              >
                <span class="text-xs font-medium uppercase tracking-wide text-terminal-muted">Normalizado</span>
                <pre class="overflow-auto whitespace-pre-wrap break-words rounded-lg border border-terminal-border bg-terminal p-3 font-mono text-xs leading-5 text-terminal-foreground">{{ item.normalizedText }}</pre>
              </div>
            </div>
            <p
              v-if="!item.rawText && !item.normalizedText"
              class="text-sm text-muted"
            >
              Este evento no contiene payload raw adicional.
            </p>
          </div>
        </details>
      </li>
    </ol>
  </section>
</template>
