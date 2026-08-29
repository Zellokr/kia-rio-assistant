<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

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

const emit = defineEmits<{
  command: [QuickCommandIntent]
}>()

const open = ref(false)
const typed = ref('')
const feedback = ref('')
const field = ref<{ input?: HTMLInputElement } | null>(null)

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
 * Runs one command. Only a recognised, supported intent reaches the parent;
 * everything else is answered here, because the reason belongs next to the
 * field that produced it.
 */
function run(text: string): void {
  const trimmed = text.trim()

  if (!trimmed) {
    return
  }

  const match = parseQuickCommand(trimmed)

  if (!match) {
    feedback.value
      = 'No he entendido eso. Prueba con Estado, DTC, Temperatura o Testigo.'

    return
  }

  if (!match.supported) {
    feedback.value
      = 'Guardar notas todavía no está disponible en esta versión.'

    return
  }

  emit('command', match.intent)

  typed.value = ''
  feedback.value = ''
  open.value = false
}
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
          placeholder="Estado, DTC, Temperatura…"
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
