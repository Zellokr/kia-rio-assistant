<script setup lang="ts">
import { computed } from 'vue'

import type {
  ObdSessionState
} from '~~/core/obd/session/ObdSessionStateMachine'
import {
  CONNECTION_PHASES,
  describeSessionStatus
} from '~/utils/sessionStatusPresentation'

const props = defineProps<{
  sessionState: ObdSessionState
}>()

const status = computed(() => describeSessionStatus(props.sessionState))

/**
 * Tone classes are written out per branch rather than interpolated into a
 * class name. Tailwind only ships the classes it can see in the source, and
 * a name assembled at runtime is a name it cannot see — the colour would
 * simply be missing from the build.
 */
const tone = computed(() => {
  switch (status.value.tone) {
    case 'ready':
      return {
        dot: 'bg-success',
        ring: 'bg-success/30',
        text: 'text-success',
        surface: 'border-success/30 bg-success/5'
      }
    case 'progress':
      return {
        dot: 'bg-warning',
        ring: 'bg-warning/30',
        text: 'text-warning',
        surface: 'border-warning/30 bg-warning/5'
      }
    case 'attention':
      return {
        dot: 'bg-error',
        ring: 'bg-error/30',
        text: 'text-error',
        surface: 'border-error/30 bg-error/5'
      }
    default:
      return {
        dot: 'bg-muted',
        ring: 'bg-muted/30',
        text: 'text-muted',
        surface: 'border-default bg-elevated'
      }
  }
})
</script>

<template>
  <!--
    The connection state used to be a grey line of text under the button and
    a small badge in the header, both saying the same word in the same
    colour whatever was happening.

    Colour never carries the meaning on its own: every tone ships with an
    icon and a label, and the phase markers below are shape as well as hue.
  -->
  <div
    class="flex flex-col gap-3 rounded-xl border px-4 py-3 transition-colors"
    :class="tone.surface"
    role="status"
    aria-live="polite"
  >
    <div class="flex items-center gap-3">
      <!--
        A dot that pulses while something is in flight. Seven seconds of a
        motionless "Conectando" reads as a hang; one that breathes reads as
        working. Held still for anyone who asked the system for less motion.
      -->
      <span class="relative flex size-3 shrink-0">
        <span
          v-if="status.busy"
          class="absolute inline-flex size-full animate-ping rounded-full motion-reduce:hidden"
          :class="tone.ring"
        />
        <span
          class="relative inline-flex size-3 rounded-full"
          :class="tone.dot"
        />
      </span>

      <UIcon
        :name="status.icon"
        class="size-5 shrink-0"
        :class="tone.text"
        aria-hidden="true"
      />

      <div class="min-w-0 flex-1">
        <p
          class="font-semibold leading-tight"
          :class="tone.text"
        >
          {{ status.label }}
        </p>
        <p class="text-sm leading-5 text-muted">
          {{ status.detail }}
        </p>
      </div>
    </div>

    <!--
      Where the connection is, not just that it is busy. Reaching ready took
      7.5–9.8 s on the vehicle, nearly all of it in the first phase, so a
      driver otherwise stares at one unchanging word for most of the wait.
    -->
    <ol
      v-if="status.phase !== undefined"
      class="flex items-center gap-2"
    >
      <li
        v-for="(item, index) in CONNECTION_PHASES"
        :key="item.key"
        class="flex flex-1 flex-col gap-1"
      >
        <span
          class="h-1 rounded-full transition-colors"
          :class="index < status.phase! ? tone.dot : 'bg-default'"
        />
        <span
          class="text-xs"
          :class="index < status.phase! ? tone.text : 'text-muted'"
        >
          {{ item.label }}
        </span>
      </li>
    </ol>
  </div>
</template>
