<script setup lang="ts">
import type { ObdSessionState } from '~~/core/obd/session/ObdSessionStateMachine'
import type { ObdTransportChoice } from '~/utils/obdTransportChoice'

/**
 * The select that used to write this is gone: it offered exactly one option,
 * and `createLabTransport` throws for every other value the type still
 * admits. A control with one choice is not a choice — it asks the driver to
 * make a decision that does not exist.
 *
 * The model stays because the page owns the value and the data view reads it
 * to decide which commands it may offer.
 */
defineModel<ObdTransportChoice>('transportChoice', { required: true })

defineProps<{
  sessionState: ObdSessionState
  sessionStateLabel: string
  transportError: string
  sessionBusy: boolean
}>()

const emit = defineEmits<{
  'select-device': []
  'connect': []
  'disconnect': []
}>()
</script>

<template>
  <!--
    The connect button used to live inside a collapsed `<details>` labelled
    "Controles técnicos", along with every other control on this screen. The
    page announced "Primer paso: conectar con el coche" and then hid the way
    to do it behind a door whose label told a driver it was not for them —
    there was no button on screen at all until they opened it.

    One primary action, always visible. Everything that inspects the adapter
    rather than uses the car sits behind a single door at the bottom.
  -->
  <section
    class="flex flex-col gap-3"
    aria-labelledby="connection-view-title"
  >
    <h1
      id="connection-view-title"
      class="px-1 text-2xl font-bold tracking-tight text-highlighted"
    >
      Conectar con el coche
    </h1>

    <!--
      The steps that happen away from the phone. Searching for the adapter
      cannot succeed before it is plugged in and the car is powered, and when
      it failed the driver had no way to know that was the reason.
    -->
    <ol class="flex flex-col gap-2">
      <li class="flex items-start gap-3 rounded-xl border border-default bg-default px-3 py-2.5">
        <span
          class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
          aria-hidden="true"
        >1</span>
        <span class="min-w-0 flex-1">
          <span class="block font-semibold text-highlighted">
            Enchufa el adaptador
          </span>
          <span class="block text-sm leading-5 text-muted">
            Bajo el volante, a la izquierda.
          </span>
        </span>
      </li>
      <li class="flex items-start gap-3 rounded-xl border border-default bg-default px-3 py-2.5">
        <span
          class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
          aria-hidden="true"
        >2</span>
        <span class="min-w-0 flex-1">
          <span class="block font-semibold text-highlighted">
            Da contacto sin arrancar
          </span>
          <span class="block text-sm leading-5 text-muted">
            Gira la llave un paso. No hace falta el motor.
          </span>
        </span>
      </li>
    </ol>

    <UAlert
      v-if="transportError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="No se pudo conectar"
      :description="transportError"
    />

    <!--
      One button, whichever step the session is on, labelled with what will
      happen next rather than with the state the machine is in. The state
      itself goes underneath, in one line, announced politely so a screen
      reader hears it change without losing the button.
    -->
    <div class="flex flex-col gap-2">
      <UButton
        v-if="sessionState === 'idle' || sessionState === 'disconnected' || sessionState === 'error'"
        color="primary"
        size="xl"
        block
        icon="i-lucide-bluetooth-searching"
        class="min-h-14 justify-center text-base"
        @click="emit('select-device')"
      >
        Buscar mi adaptador
      </UButton>
      <UButton
        v-else-if="sessionState === 'selected'"
        color="primary"
        size="xl"
        block
        icon="i-lucide-plug"
        class="min-h-14 justify-center text-base"
        @click="emit('connect')"
      >
        Conectar
      </UButton>
      <UButton
        v-else-if="sessionBusy"
        color="neutral"
        variant="soft"
        size="xl"
        block
        loading
        disabled
        class="min-h-14 justify-center text-base"
      >
        {{ sessionStateLabel }}
      </UButton>
      <UButton
        v-else
        color="neutral"
        variant="soft"
        size="xl"
        block
        icon="i-lucide-unplug"
        class="min-h-14 justify-center text-base"
        @click="emit('disconnect')"
      >
        Desconectar
      </UButton>

      <p
        class="px-1 text-center text-sm text-muted"
        aria-live="polite"
      >
        {{ sessionStateLabel }}
      </p>
    </div>

    <!--
      The safety promise, in the vocabulary of the person being reassured.
      It read "Sin Mode 04, programación ni escritura en ECU", which answers
      a question a driver has not got the words to ask, and lands as a
      warning rather than as comfort.
    -->
    <p class="flex items-start gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm leading-5 text-muted">
      <UIcon
        name="i-lucide-shield-check"
        class="mt-0.5 size-4 shrink-0 text-success"
        aria-hidden="true"
      />
      <span>
        <span class="font-medium text-highlighted">Esta app solo lee.</span>
        Nunca cambia nada en tu coche, ni borra los avisos del cuadro.
      </span>
    </p>

    <!--
      There is no advanced door any more.

      It held the GATT inspector and the BLE pipe probe — the tools that
      discovered which characteristic to write and which to listen on. That
      inspection completed on 2026-08-24 and its result is a constant,
      `VEEPEAK_BLE_PROFILE`, so the app never needs to run it again. What was
      left on screen was a second "Buscar…" button beside the real one, doing
      something entirely different and saying so only in small print.

      The procedure survives in docs/STEP_19_GATT_INSPECTION.md for the next
      adapter or a firmware change, and the code is in git.

      The link state it also showed was a third copy of what the button and
      the line under it already say.
    -->
  </section>
</template>
