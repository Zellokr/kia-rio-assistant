<script setup lang="ts">
import { useSpeechCapability } from '~/composables/useSpeechCapability'
import { useSpeechListener } from '~/composables/useSpeechListener'
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
  copy: []
  clear: []
}>()

/**
 * The device speech probe lives here rather than behind a sixth tab: the
 * bottom bar is capped at five destinations on purpose, and this is technical
 * evidence, which is what this destination already holds.
 */
const { report: speechReport, probe: probeSpeech } = useSpeechCapability()

/**
 * The push-to-talk probe sits under the capability panel because it answers
 * the question that panel raises: the recognizer's constructor is present in
 * this WebView, and only a real `start()` says whether it works.
 */
const {
  state: listenerState,
  transcript,
  transcriptIsFinal,
  reason: listenerReason,
  press,
  release
} = useSpeechListener()
</script>

<template>
  <div class="space-y-4">
    <SpeechCapabilityPanel
      :report="speechReport"
      @refresh="probeSpeech"
    />

    <PushToTalkProbe
      :state="listenerState"
      :transcript="transcript"
      :transcript-is-final="transcriptIsFinal"
      :reason="listenerReason"
      @press="press"
      @release="release"
    />

    <SessionLogPanel
      :events="events"
      :dropped-events="droppedEvents"
      :truncated="truncated"
      :copy-status="copyStatus"
      @copy="emit('copy')"
      @clear="emit('clear')"
    />
  </div>
</template>
