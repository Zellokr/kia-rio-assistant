<script setup lang="ts">
import type {
  ObdSessionEvent
} from '~~/core/obd/logging/ObdSessionLog'

defineProps<{
  events: ObdSessionEvent[]
  droppedEvents: number
  truncated: boolean
  copyStatus?: string
  /** TEMPORARY — field-test evidence delivery. See `telegramFieldLog.ts`. */
  telegramEnabled?: boolean
}>()

const emit = defineEmits<{
  export: []
  copy: []
  clear: []
  telegram: []
}>()
</script>

<template>
  <SessionLogPanel
    :events="events"
    :dropped-events="droppedEvents"
    :truncated="truncated"
    :copy-status="copyStatus"
    :telegram-enabled="telegramEnabled"
    @export="emit('export')"
    @copy="emit('copy')"
    @clear="emit('clear')"
    @telegram="emit('telegram')"
  />
</template>
