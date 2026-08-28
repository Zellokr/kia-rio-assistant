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
  -->
  <span
    class="flex min-h-9 items-center gap-2 rounded-full border border-default bg-elevated px-2.5"
    role="status"
    aria-live="polite"
    :aria-label="`Estado de la conexión: ${status.label}`"
  >
    <span class="relative flex size-2 shrink-0">
      <span
        v-if="status.busy"
        class="absolute inline-flex size-full animate-ping rounded-full motion-reduce:hidden"
        :class="tone.ring"
      />
      <span
        class="relative inline-flex size-2 rounded-full"
        :class="tone.dot"
      />
    </span>

    <UIcon
      :name="status.icon"
      class="size-4 shrink-0"
      :class="tone.text"
      aria-hidden="true"
    />

    <span
      class="hidden truncate text-xs font-medium sm:inline"
      :class="tone.text"
      aria-hidden="true"
    >
      {{ status.label }}
    </span>
  </span>
</template>
