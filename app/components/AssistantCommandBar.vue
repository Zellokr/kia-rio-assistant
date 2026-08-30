<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { useSpeechListener } from '~/composables/useSpeechListener'
import {
  parseQuickCommand,
  type QuickCommandIntent
} from '~~/core/assistant/parseQuickCommand'

/**
 * The text half of RF-030, and the reason the voice half is optional.
 *
 * RF-030 is only accepted if "la función principal no depende del
 * reconocimiento de voz", so this needs no microphone, no permission and no
 * speech engine. It is the path that works when everything about speech is
 * still unproven — which, until `docs/SPEECH_DEVICE_VALIDATION.md` runs, is
 * all of it.
 *
 * It sits above the speech toggle rather than inside it. Folding both into
 * one control would have put the mute behind a panel, and RF-031 wants
 * silencing the app to be one press, not two.
 *
 * A sixth bottom-bar tab was the other option and was rejected:
 * `BottomTabBar` fixes its grid at five columns on purpose, so the driver
 * never has to hunt for a destination behind a scroll gesture.
 */

export interface AssistantCommandQuery {
  readonly text: string
  readonly source: 'text' | 'speech'
}

const emit = defineEmits<{
  command: [QuickCommandIntent]
  query: [AssistantCommandQuery]
}>()

const open = ref(false)
const typed = ref('')
const feedback = ref('')
const field = ref<{ input?: HTMLInputElement } | null>(null)
const lastSpeechFinal = ref('')

const speech = useSpeechListener()

/** Spanish, user-facing. §11 names these five, in this order. */
const QUICK_COMMANDS: ReadonlyArray<{
  label: string
  input: string
  supported: boolean
}> = [
  { label: 'Estado', input: 'estado', supported: true },
  { label: 'DTC', input: 'dtc', supported: true },
  { label: 'Temperatura', input: 'temperatura', supported: true },
  { label: 'Testigo', input: 'testigo', supported: true },
  /**
   * Shown disabled rather than hidden. §11 lists it, so leaving it out would
   * look like an oversight; enabling it would promise a Fase 4 maintenance
   * record this app cannot write.
   */
  { label: 'Guardar nota', input: 'nota', supported: false }
]

const openerLabel = computed(() =>
  open.value
    ? 'Cerrar los comandos'
    : 'Escribir un comando'
)

async function toggleOpen(): Promise<void> {
  open.value = !open.value
  feedback.value = ''

  if (!open.value) {
    return
  }

  await nextTick()

  field.value?.input?.focus()
}

/**
 * Runs one command. Recognised, supported intents stay deterministic and reach
 * the parent as commands; open questions reach the assistant query path.
 */
function run(text: string): void {
  runRecognisedInput(text, 'text')
}

function runSpeech(text: string): void {
  runRecognisedInput(text, 'speech')
}

function runRecognisedInput(
  text: string,
  source: 'text' | 'speech'
): void {
  const trimmed = text.trim()

  if (!trimmed) {
    return
  }

  const match = parseQuickCommand(trimmed)

  if (!match) {
    emit('query', { text: trimmed, source })

    if (source === 'text') {
      typed.value = ''
    }

    feedback.value = ''
    open.value = false

    return
  }

  if (!match.supported) {
    feedback.value
      = 'Guardar notas todavía no está disponible en esta versión.'

    return
  }

  emit('command', match.intent)

  if (source === 'text') {
    typed.value = ''
  }

  feedback.value = ''
  open.value = false
}

function toggleSpeech(): void {
  if (speech.state.value === 'starting' || speech.state.value === 'listening') {
    speech.release()

    return
  }

  lastSpeechFinal.value = ''
  feedback.value = ''
  speech.press()
}

watch(
  [speech.transcript, speech.transcriptIsFinal],
  ([transcript, isFinal]) => {
    const finalTranscript = transcript.trim()

    if (!isFinal || !finalTranscript) {
      return
    }

    if (finalTranscript === lastSpeechFinal.value) {
      return
    }

    lastSpeechFinal.value = finalTranscript
    runSpeech(finalTranscript)
  }
)
</script>

<template>
  <!--
    Stacked directly above the speech toggle, same corner, same safe-area
    handling. The offsets clear that button (3.5rem) plus a gap, and below
    `md` they also clear BottomTabBar, exactly as the toggle does.
  -->
  <div
    class="fixed z-50 flex flex-col items-end gap-2
           right-[calc(1rem+env(safe-area-inset-right))]
           left-[calc(1rem+env(safe-area-inset-left))]
           bottom-[calc(9.75rem+env(safe-area-inset-bottom))]
           md:left-auto md:bottom-[calc(5.75rem+env(safe-area-inset-bottom))]"
  >
    <div
      v-if="open"
      class="w-full rounded-2xl border border-default bg-default/95 p-3 shadow-lg backdrop-blur md:w-96"
    >
      <form
        class="flex items-center gap-2"
        @submit.prevent="run(typed)"
      >
        <UInput
          ref="field"
          v-model="typed"
          placeholder="Estado, DTC, Temperatura o pregunta…"
          aria-label="Escribe un comando"
          autocomplete="off"
          class="min-w-0 flex-1"
          size="lg"
        />

        <UButton
          type="submit"
          icon="i-lucide-corner-down-left"
          aria-label="Enviar el comando"
          size="lg"
        />
      </form>

      <div class="mt-2 flex flex-wrap gap-1.5">
        <UButton
          v-for="command in QUICK_COMMANDS"
          :key="command.input"
          data-testid="assistant-quick"
          :disabled="!command.supported"
          :title="command.supported
            ? undefined
            : 'Todavía no disponible'"
          color="neutral"
          variant="soft"
          size="sm"
          @click="run(command.input)"
        >
          {{ command.label }}
        </UButton>
      </div>

      <div class="mt-3 rounded-xl border border-default p-2">
        <UButton
          type="button"
          data-testid="assistant-speech"
          :icon="speech.state.value === 'listening'
            ? 'i-lucide-mic'
            : 'i-lucide-mic-2'"
          :aria-label="speech.state.value === 'starting' || speech.state.value === 'listening'
            ? 'Detener el dictado del comando'
            : 'Toca para dictar un comando'"
          :title="speech.state.value === 'starting' || speech.state.value === 'listening'
            ? 'Detener el dictado del comando'
            : 'Toca para dictar un comando'"
          color="neutral"
          variant="soft"
          size="sm"
          @click="toggleSpeech"
        >
          {{ speech.state.value === 'starting'
            ? 'Abriendo micrófono…'
            : speech.state.value === 'listening'
              ? 'Escuchando…'
              : 'Dictar comando' }}
        </UButton>

        <p class="mt-1 text-xs text-muted">
          Entrada de voz opcional: toca para empezar y vuelve a tocar para parar.
        </p>

        <p
          v-if="speech.transcript.value"
          class="mt-1 text-sm text-muted"
          aria-live="polite"
        >
          “{{ speech.transcript.value }}”
          <span v-if="!speech.transcriptIsFinal.value">(provisional)</span>
        </p>

        <p
          v-if="speech.reason.value"
          class="mt-1 text-sm text-error"
          role="status"
        >
          {{ speech.reason.value }}
        </p>
      </div>

      <!--
        The answer to a request that went nowhere. Without it the field just
        swallows the text, which reads as a broken app rather than a command
        the assistant does not know.
      -->
      <p
        v-if="feedback"
        class="mt-2 text-sm text-muted"
        role="status"
      >
        {{ feedback }}
      </p>
    </div>

    <UButton
      data-testid="assistant-open"
      :icon="open ? 'i-lucide-x' : 'i-lucide-message-square'"
      :aria-label="openerLabel"
      :title="openerLabel"
      :aria-expanded="open"
      color="neutral"
      variant="solid"
      size="lg"
      class="size-12 items-center justify-center rounded-full shadow-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      :ui="{ leadingIcon: 'size-5' }"
      @click="toggleOpen"
    />
  </div>
</template>
