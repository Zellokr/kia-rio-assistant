<script setup lang="ts">
import type {
  ObdSessionEvent
} from '~~/core/obd/logging/ObdSessionLog'

defineProps<{
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
</script>

<template>
  <SessionLogPanel
    :events="events"
    :dropped-events="droppedEvents"
    :truncated="truncated"
    :copy-status="copyStatus"
    @export="emit('export')"
    @copy="emit('copy')"
    @clear="emit('clear')"
  />
</template>
