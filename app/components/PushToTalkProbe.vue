<script setup lang="ts">
import type { ListenerState } from '~~/core/speech/SpeechListener'

/**
 * The smallest thing that can answer "does recognition actually start?".
 *
 * Check 6 found the `SpeechRecognition` constructor present in this WebView
 * while `speechSynthesis` was absent. A constructor is not a recognizer, and
 * nothing short of a real `start()` distinguishes one that works from one
 * that throws, is denied the microphone, or has no service behind it. This
 * performs that `start()` and shows exactly what came back.
 *
 * **It is deliberately not wired to §11's commands.** Whether the microphone
 * works and whether the app acts on what was said are two questions, and a
 * probe that answers both at once produces a failure nobody can read. The
 * transcript is displayed and discarded.
 */

defineProps<{
  state: ListenerState
  transcript: string
  transcriptIsFinal: boolean
  reason: string | null
}>()

const emit = defineEmits<{
  press: []
  release: []
}>()

/**
 * The Web Speech error codes worth recognising, in Spanish.
 *
 * Shown next to the raw code, never instead of it: these four mean four
 * different things, and the code is what survives being typed into a report.
 */
const REASON_GLOSSES: Record<string, string> = {
  'not-allowed':
    'El sistema denegó el micrófono a la app. Comprueba el permiso de '
    + 'grabación en los ajustes de Android.',
  'service-not-allowed':
    'El dispositivo no ofrece servicio de reconocimiento a este WebView. '
    + 'Es el resultado que obliga a un puente nativo.',
  'no-speech':
    'El micrófono se abrió pero no se oyó nada. El motor funciona; repite '
    + 'hablando durante la pulsación.',
  'network':
    'El reconocedor necesitó red y no la tuvo. No es un fallo del micrófono.',
  'audio-capture':
    'No se pudo capturar audio del micrófono.',
  'aborted':
    'La sesión se cortó antes de terminar.'
}

const STATE_LABELS: Record<ListenerState, string> = {
  idle: 'Mantén pulsado el botón y habla.',
  starting: 'Abriendo el micrófono…',
  listening: 'Escuchando.',
  unavailable: 'El reconocedor falló.'
}
</script>

<template>
  <UCard>
    <h3 class="text-sm font-semibold">
      Sonda de push-to-talk
    </h3>

    <p class="mt-1 text-sm text-muted">
      Comprueba si el reconocimiento arranca de verdad. Muestra lo que oye y
      <strong>no ejecuta ningún comando</strong>.
    </p>

    <UButton
      class="mt-3 w-full justify-center"
      size="xl"
      :color="state === 'unavailable' ? 'error' : 'primary'"
      :variant="state === 'listening' ? 'solid' : 'subtle'"
      @pointerdown="emit('press')"
      @pointerup="emit('release')"
      @pointerleave="emit('release')"
      @pointercancel="emit('release')"
    >
      Mantener para hablar
    </UButton>

    <p class="mt-3 text-sm">
      {{ STATE_LABELS[state] }}
    </p>

    <p
      v-if="transcript"
      class="mt-2 text-sm"
    >
      «{{ transcript }}»
      <span class="text-muted">
        ({{ transcriptIsFinal ? 'definitivo' : 'provisional' }})
      </span>
    </p>

    <div
      v-if="reason"
      class="mt-2 space-y-1 text-sm"
    >
      <!-- Verbatim, and first: it is the finding. -->
      <p class="font-mono">
        {{ reason }}
      </p>

      <p
        v-if="REASON_GLOSSES[reason]"
        class="text-muted"
      >
        {{ REASON_GLOSSES[reason] }}
      </p>
    </div>
  </UCard>
</template>
