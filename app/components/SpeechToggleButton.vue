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

/**
 * A talking assistant, not a media player.
 *
 * `audio-lines` is a waveform: it reads as *a voice speaking*, which is what
 * being on actually means here. The off and unavailable states keep the
 * crossed-out speaker, because that is the one mute symbol every driver
 * already knows, and the moment to be inventive is not the one where someone
 * is trying to shut the app up at 90 km/h.
 */
const presentation = computed(() => {
  /**
   * The engine has been asked to speak and has not made a sound yet. Showing
   * the off icon here made the press look ignored for as long as the engine
   * took to start, so this says "working, nothing proven" instead — and the
   * button stays enabled, because a stuck engine has to be abandonable.
   */
  if (state.value === 'starting') {
    return {
      icon: 'i-lucide-loader-circle',
      color: 'neutral' as const,
      label: 'Activando la voz…'
    }
  }

  if (state.value === 'on') {
    return {
      icon: 'i-lucide-audio-lines',
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
  <div
    class="fixed z-50 size-14
           right-[calc(1rem+env(safe-area-inset-right))]
           bottom-[calc(5.5rem+env(safe-area-inset-bottom))]
           md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
  >
    <!--
      The halo pulses, not the button.

      Animating the button itself would move the icon a driver is trying to
      hit, and fade the very symbol that says what state it is in. A ring
      behind it carries the "speaking" signal while the target stays still and
      legible.

      `-inset-2` is load-bearing, not spacing. At `inset-0` this sat exactly
      under an opaque button and was invisible — present in the DOM, painting
      nothing. It has to reach past the button's edge to be seen at all.

      It is decoration on purpose: colour and the icon already say the voice is
      on, so `motion-reduce` can drop the animation entirely without losing
      information. `pointer-events-none` keeps it from ever eating a tap.
    -->
    <span
      v-if="state === 'on'"
      data-testid="speech-pulse"
      class="pointer-events-none absolute -inset-2 rounded-full bg-primary/30 ring-2 ring-primary/50 animate-pulse motion-reduce:animate-none"
      aria-hidden="true"
    />

    <UButton
      :icon="presentation.icon"
      :color="presentation.color"
      :aria-label="presentation.label"
      :title="presentation.label"
      :aria-pressed="state === 'on'"
      variant="solid"
      size="xl"
      class="relative size-14 items-center justify-center rounded-full shadow-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      :ui="{
        leadingIcon: state === 'starting'
          ? 'size-6 animate-spin motion-reduce:animate-none'
          : 'size-6'
      }"
      @click="onToggle"
    />
  </div>
</template>
