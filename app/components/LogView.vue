<script setup lang="ts">
import type {
  ObdSessionEvent
} from '~~/core/obd/logging/ObdSessionLog'

defineProps<{
  events: ObdSessionEvent[]
  droppedEvents: number
  truncated: boolean
}>()

const emit = defineEmits<{
  export: []
  clear: []
}>()
</script>

<template>
  <SessionLogPanel
    :events="events"
    :dropped-events="droppedEvents"
    :truncated="truncated"
    @export="emit('export')"
    @clear="emit('clear')"
  />
</template>
