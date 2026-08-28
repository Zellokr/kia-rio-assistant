<script setup lang="ts">
import type { ObdSessionState } from '~~/core/obd/session/ObdSessionStateMachine'
import type { ObdTransportState } from '~~/core/obd/transport/ObdTransport'
import type { ObdTransportChoice } from '~/utils/obdTransportChoice'
import ElmPipeProbePanel from '~/components/ElmPipeProbePanel.vue'
import GattInspectorPanel from '~/components/GattInspectorPanel.vue'

export type ConnectionBadgeColor
  = | 'neutral'
    | 'warning'
    | 'primary'
    | 'success'
    | 'error'

/**
 * `defineModel` instead of a prop plus an `update:` emit plus a change
 * handler. The handler it replaces read `event.target as HTMLSelectElement`
 * and then cast the string back into the union — two casts that told the
 * compiler to trust markup it could not see.
 */
const transportChoice = defineModel<ObdTransportChoice>(
  'transportChoice',
  { required: true }
)

const TRANSPORT_OPTIONS: { label: string, value: ObdTransportChoice }[] = [
  { label: 'Real · VEEPEAK Bluetooth LE', value: 'android-ble' }
]

defineProps<{
  sessionState: ObdSessionState
  sessionStateLabel: string
  transportState: ObdTransportState
  transportError: string

  sessionBusy: boolean
  sessionBadgeColor: ConnectionBadgeColor
}>()

const emit = defineEmits<{
  'select-device': []
  'connect': []
  'disconnect': []
}>()
</script>

<template>
  <section
    class="flex flex-col gap-4"
    aria-labelledby="connection-view-title"
  >
    <div class="flex flex-col gap-1 px-1">
      <p class="text-sm font-medium text-primary">
        Primer paso
      </p>
      <h1
        id="connection-view-title"
        class="text-2xl font-bold tracking-tight text-highlighted"
      >
        Conectar con el coche
      </h1>
      <p class="text-sm leading-5 text-muted">
        Busca el adaptador VEEPEAK y conéctalo de forma segura para ver las
        lecturas del coche.
      </p>
    </div>

    <details class="group rounded-xl border border-default bg-default">
      <summary class="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <UIcon
          name="i-lucide-wrench"
          class="size-5 text-muted"
          aria-hidden="true"
        />
        <span class="flex-1">
          <span class="block font-semibold text-highlighted">Comprobaciones técnicas</span>
          <span class="block text-sm text-muted">Solo para revisar el adaptador Bluetooth</span>
        </span>
        <UIcon
          name="i-lucide-chevron-down"
          class="size-5 text-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div class="flex flex-col gap-4 border-t border-default p-4">
        <GattInspectorPanel />
        <ElmPipeProbePanel />
      </div>
    </details>

    <details class="group rounded-xl border border-default bg-default">
      <summary class="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
          <UIcon
            name="i-lucide-toolbox"
            class="size-5"
            aria-hidden="true"
          />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-semibold text-highlighted">
            Controles técnicos
          </span>
          <span class="block text-sm text-muted">
            Adaptador real VEEPEAK para diagnóstico local
          </span>
        </span>
        <UIcon
          name="i-lucide-chevron-down"
          class="size-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>

      <div class="flex flex-col gap-5 border-t border-default p-4">
        <div class="flex flex-col gap-2">
          <label
            for="transport-choice"
            class="text-sm font-medium text-highlighted"
          >
            Fuente de datos OBD
          </label>
          <USelect
            id="transport-choice"
            v-model="transportChoice"
            :items="TRANSPORT_OPTIONS"
            class="min-h-12 w-full"
            size="lg"
            :disabled="sessionState !== 'idle' && sessionState !== 'disconnected' && sessionState !== 'error'"
          />
          <p class="text-sm text-muted">
            Habla con el VEEPEAK por Bluetooth LE. Solo en la aplicación
            Android, y únicamente con comandos de lectura.
          </p>
        </div>

        <div class="flex items-center justify-between gap-3 rounded-xl border border-default bg-elevated p-4">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">
              Estado OBD
            </p>
            <p class="text-sm text-muted">
              {{ sessionStateLabel }} · {{ transportState }}
            </p>
          </div>
          <UBadge
            :color="sessionBadgeColor"
            variant="solid"
          >
            {{ sessionStateLabel }}
          </UBadge>
        </div>

        <UAlert
          v-if="transportError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          title="No se pudo completar la operación"
          :description="transportError"
        />

        <UButton
          v-if="sessionState === 'idle' || sessionState === 'disconnected' || sessionState === 'error'"
          color="primary"
          size="xl"
          block
          icon="i-lucide-mouse-pointer-click"
          class="min-h-12 justify-center"
          @click="emit('select-device')"
        >
          Buscar adaptador
        </UButton>
        <UButton
          v-else-if="sessionState === 'selected'"
          color="primary"
          size="xl"
          block
          icon="i-lucide-plug"
          class="min-h-12 justify-center"
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
          class="min-h-12 justify-center"
        >
          {{ sessionStateLabel }}
        </UButton>
        <UButton
          v-else
          color="error"
          variant="soft"
          size="xl"
          block
          icon="i-lucide-unplug"
          class="min-h-12 justify-center"
          @click="emit('disconnect')"
        >
          Desconectar
        </UButton>
      </div>
    </details>
  </section>
</template>
