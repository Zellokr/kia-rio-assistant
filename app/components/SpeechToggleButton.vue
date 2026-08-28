<script setup lang="ts">
import { computed } from 'vue'

import { useSpeechAnnouncer } from '~/composables/useSpeechAnnouncer'

/**
 * The one control that silences the assistant, reachable from every view.
 *
 * RF-031 (MUST) is only accepted if "el usuario puede usar la app sin audio",
 * so the mute is not buried in a settings screen — it is a permanent target in
 * the corner, and it starts OFF.
 *
 * Pressing it does not query the engine, it USES it: `SpeechAnnouncer.enable`
 * speaks a confirmation and believes the result (ADR-012). So the third state
 * here is real and not decorative — the engine can be missing from this
 * WebView entirely, and the button has to say so rather than pretending to
 * have turned on.
 */

const { state, unavailableReason, toggle } = useSpeechAnnouncer()

const toast = useToast()

const presentation = computed(() => {
  if (state.value === 'on') {
    return {
      icon: 'i-lucide-volume-2',
      color: 'primary' as const,
      label: 'Silenciar la voz'
    }
  }

  if (state.value === 'unavailable') {
    return {
      icon: 'i-lucide-volume-off',
      color: 'error' as const,
      label: 'La voz no está disponible. Reintentar'
    }
  }

  return {
    icon: 'i-lucide-volume-x',
    color: 'neutral' as const,
    label: 'Activar la voz'
  }
})

async function onToggle(): Promise<void> {
  await toggle()

  /**
   * The reason is shown, not swallowed. "No suena y no sé por qué" is the
   * failure this whole work item exists to avoid, and the usual cause —
   * no Spanish voice pack installed — is something the user can go and fix.
   */
  if (state.value === 'unavailable') {
    toast.add({
      title: 'No se pudo activar la voz',
      description: unavailableReason.value ?? undefined,
      color: 'error',
      icon: 'i-lucide-volume-off'
    })
  }
}
</script>

<template>
  <!--
    Bottom right, clear of BottomTabBar.

    That bar is `fixed bottom-0` and only on mobile (`md:hidden`), so a button
    pinned to `bottom-0` would sit on top of navigation the driver needs. It is
    lifted above the bar below `md`, and drops to the normal corner inset above
    it, where the bar is gone. Both offsets carry the safe-area inset so the
    button clears the home indicator.
  -->
  <UButton
    :icon="presentation.icon"
    :color="presentation.color"
    :aria-label="presentation.label"
    :title="presentation.label"
    :aria-pressed="state === 'on'"
    variant="solid"
    size="xl"
    class="fixed z-50 size-14 items-center justify-center rounded-full shadow-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
           right-[calc(1rem+env(safe-area-inset-right))]
           bottom-[calc(5.5rem+env(safe-area-inset-bottom))]
           md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
    :ui="{ leadingIcon: 'size-6' }"
    @click="onToggle"
  />
</template>
