<script setup lang="ts">
import { useSpeechCapability } from '~/composables/useSpeechCapability'
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
  copy: []
  clear: []
  telegram: []
}>()

/**
 * The device speech probe lives here rather than behind a sixth tab: the
 * bottom bar is capped at five destinations on purpose, and this is technical
 * evidence, which is what this destination already holds.
 */
const { report: speechReport, probe: probeSpeech } = useSpeechCapability()
</script>

<template>
  <div class="space-y-4">
    <SpeechCapabilityPanel
      :report="speechReport"
      @refresh="probeSpeech"
    />

    <SessionLogPanel
      :events="events"
      :dropped-events="droppedEvents"
      :truncated="truncated"
      :copy-status="copyStatus"
      :telegram-enabled="telegramEnabled"
      @copy="emit('copy')"
      @clear="emit('clear')"
      @telegram="emit('telegram')"
    />
  </div>
</template>
