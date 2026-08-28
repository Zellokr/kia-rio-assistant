<script setup lang="ts">
import { computed } from 'vue'

import { useSessionStateBeacon } from '~/composables/useSessionStateBeacon'
import { describeSessionStatus } from '~/utils/sessionStatusPresentation'

const sessionState = useSessionStateBeacon()

const status = computed(() => describeSessionStatus(sessionState.value))

/**
 * Written out per branch rather than interpolated. Tailwind ships only the
 * class names it can see in the source, and a name assembled at runtime is
 * one it cannot see — the colour would be missing from the build.
 */
const tone = computed(() => {
  switch (status.value.tone) {
    case 'ready':
      return { dot: 'bg-success', ring: 'bg-success/30', text: 'text-success' }
    case 'progress':
      return { dot: 'bg-warning', ring: 'bg-warning/30', text: 'text-warning' }
    case 'attention':
      return { dot: 'bg-error', ring: 'bg-error/30', text: 'text-error' }
    default:
      return { dot: 'bg-muted', ring: 'bg-muted/30', text: 'text-muted' }
  }
})
</script>

<template>
  <!--
    The session state, kept on screen wherever you are in the app.

    The header carried a static "Solo lectura" badge here. That claim is
    permanent and already stated on the page; what changes while you use the
    app — and what you want to check from the Datos or Registro views
    without navigating back — is whether the car is still answering.

    The label hides on a narrow header, so the icon carries the meaning
    alongside the colour rather than the colour carrying it alone. The full
    sentence stays in `aria-label` either way.

    It is a circle without the label and a pill with it. There used to be a
    separate status dot beside the icon, which left a capsule 52 px wide and
    36 px tall on a phone — the padding and gap of a label that was no
    longer there, with two small marks adrift inside it. The icon already
    distinguishes the states by shape, so it took over the dot's other job
    too: the pulse now rings the icon.
  -->
  <span
    class="flex size-9 items-center justify-center rounded-full border border-default bg-elevated sm:w-auto sm:justify-start sm:gap-2 sm:px-2.5"
    role="status"
    aria-live="polite"
    :aria-label="`Estado de la conexión: ${status.label}`"
  >
    <span class="relative flex size-4 shrink-0 items-center justify-center">
      <span
        v-if="status.busy"
        class="absolute inline-flex size-full animate-ping rounded-full motion-reduce:hidden"
        :class="tone.ring"
      />
      <UIcon
        :name="status.icon"
        class="relative size-4"
        :class="tone.text"
        aria-hidden="true"
      />
    </span>

    <span
      class="hidden truncate text-xs font-medium sm:inline"
      :class="tone.text"
      aria-hidden="true"
    >
      {{ status.label }}
    </span>
  </span>
</template>
