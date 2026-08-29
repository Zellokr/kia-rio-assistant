<script setup lang="ts">
import type {
  RecognitionVendor,
  SpeechCapabilityReport,
  SpeechSupport
} from '~~/core/speech/detectSpeechCapability'

/**
 * Shows what the Web Speech APIs look like from inside this WebView.
 *
 * It exists because check 1 of `docs/SPEECH_DEVICE_VALIDATION.md` failed on
 * 2026-08-29 — `window.speechSynthesis` is absent on the phone — and the
 * obvious next conclusion, that recognition is absent too, was an inference
 * nobody had measured. The probe already computed `recognition`; nothing put
 * it on a screen. This does, so the push-to-talk decision rests on a reading
 * instead of on a reasonable guess.
 *
 * The panel reports and never concludes. `provesItWorks` is always false and
 * is rendered as a permanent caveat rather than hidden in a type: a green
 * "disponible" read as proof of a working engine is the precise mistake
 * ADR-012 exists to prevent, and the only thing that proves synthesis is
 * hearing it (the toggle) or, for recognition, a real `start()`.
 */

defineProps<{
  /** `null` until the probe has run on the client. */
  report: SpeechCapabilityReport | null
}>()

const emit = defineEmits<{
  refresh: []
}>()

/** Spanish, user-facing: this is read on a phone, in a car. */
const SUPPORT_LABELS: Record<SpeechSupport, string> = {
  'absent': 'ausente',
  'reachable': 'alcanzable',
  'reachable-but-unusable': 'alcanzable, no utilizable',
  'available': 'disponible'
}

const VENDOR_LABELS: Record<RecognitionVendor, string> = {
  standard: 'estándar',
  webkit: 'webkit'
}

function supportLabel(support: SpeechSupport): string {
  return SUPPORT_LABELS[support]
}

function vendorLabel(vendor: RecognitionVendor | null): string {
  return vendor ? ` (${VENDOR_LABELS[vendor]})` : ''
}
</script>

<template>
  <UCard>
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">
        Motor de voz del dispositivo
      </h3>

      <UButton
        size="xs"
        color="neutral"
        variant="subtle"
        @click="emit('refresh')"
      >
        Volver a comprobar
      </UButton>
    </div>

    <p
      v-if="!report"
      class="mt-2 text-sm text-muted"
    >
      Sin comprobar todavía.
    </p>

    <div
      v-else
      class="mt-2 space-y-2 text-sm"
    >
      <p>Síntesis (TTS): {{ supportLabel(report.synthesis) }}</p>

      <p>
        Reconocimiento (STT): {{ supportLabel(report.recognition)
        }}{{ vendorLabel(report.recognitionVendor) }}
      </p>

      <p class="text-muted">
        Voces instaladas: {{ report.voiceCount }} — en español:
        {{ report.spanishVoiceCount }}
      </p>

      <ul
        v-if="report.notes.length > 0"
        class="space-y-1 text-muted"
      >
        <li
          v-for="note in report.notes"
          :key="note"
        >
          {{ note }}
        </li>
      </ul>

      <!--
        Permanent, and deliberately not conditional on the result. A probe
        reads what exists; only speaking an utterance proves synthesis, and
        only a real start() proves recognition.
      -->
      <p class="text-muted">
        Esta comprobación lee lo que existe: no prueba que funcione.
      </p>
    </div>
  </UCard>
</template>
