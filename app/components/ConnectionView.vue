<script setup lang="ts">
import { ref, watch } from 'vue'

import type { ObdSessionState } from '~~/core/obd/session/ObdSessionStateMachine'
import type { ObdTransportState } from '~~/core/obd/transport/ObdTransport'

export type ConnectionTransportChoice
  = 'mock' | 'replay' | 'android-ble'

export type ConnectionBadgeColor
  = | 'neutral'
    | 'warning'
    | 'primary'
    | 'success'
    | 'error'

const props = defineProps<{
  transportChoice: ConnectionTransportChoice
  sessionState: ObdSessionState
  sessionStateLabel: string
  transportState: ObdTransportState
  transportError: string
  replayFilename: string
  replayImportError: string
  sessionBusy: boolean
  sessionBadgeColor: ConnectionBadgeColor
}>()

const emit = defineEmits<{
  'update:transportChoice': [ConnectionTransportChoice]
  'select-device': []
  'connect': []
  'disconnect': []
  'import-replay': [File]
}>()

const replayFileInput = ref<HTMLInputElement | null>(null)

function onTransportChoiceChange(event: Event): void {
  const select = event.target as HTMLSelectElement

  emit('update:transportChoice', select.value as ConnectionTransportChoice)
}

function onReplayFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (file) {
    emit('import-replay', file)
  }
}

watch(
  () => props.replayImportError,
  (message) => {
    if (message && replayFileInput.value) {
      replayFileInput.value.value = ''
    }
  }
)
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
        Preparar conexión
      </h1>
      <p class="text-sm leading-5 text-muted">
        Identifica el VEEPEAK con seguridad antes de activar cualquier
        transporte OBD.
      </p>
    </div>

    <GattInspectorPanel />

    <ElmPipeProbePanel />

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
            Herramientas OBD avanzadas
          </span>
          <span class="block text-sm text-muted">
            Mock, Replay y Web Serial para desarrollo
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
          <select
            id="transport-choice"
            :value="transportChoice"
            class="min-h-12 w-full rounded-lg border border-default bg-default px-4 text-base text-highlighted outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
            :disabled="sessionState !== 'idle' && sessionState !== 'disconnected' && sessionState !== 'error'"
            @change="onTransportChoiceChange"
          >
            <option value="mock">
              Mock · datos sintéticos
            </option>
            <option value="replay">
              Replay · sesión grabada
            </option>
            <option value="android-ble">
              Real · VEEPEAK Bluetooth LE
            </option>
          </select>
          <p class="text-sm text-muted">
            <template v-if="transportChoice === 'mock'">
              Verifica la aplicación sin adaptador físico.
            </template>
            <template v-else-if="transportChoice === 'replay'">
              Reproduce localmente una sesión estructurada.
            </template>
            <template v-else-if="transportChoice === 'android-ble'">
              Habla con el VEEPEAK por Bluetooth LE. Solo en la aplicación
              Android, y únicamente con comandos de lectura.
            </template>
            <template v-else>
              Requiere una plataforma con Web Serial y RFCOMM.
            </template>
          </p>
        </div>

        <div
          v-if="transportChoice === 'replay'"
          class="flex flex-col gap-2 rounded-xl border border-default bg-elevated p-4"
        >
          <label
            for="replay-file"
            class="text-sm font-medium"
          >
            Archivo de sesión JSON
          </label>
          <input
            id="replay-file"
            ref="replayFileInput"
            type="file"
            accept="application/json,.json"
            class="min-h-12 w-full text-sm text-muted file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:text-primary"
            @change="onReplayFileChange"
          >
          <p
            v-if="replayFilename"
            class="text-sm text-success"
            role="status"
          >
            Sesión cargada: {{ replayFilename }}
          </p>
          <p
            v-if="replayImportError"
            class="text-sm text-error"
            role="alert"
          >
            {{ replayImportError }}
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
          Seleccionar adaptador
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
          Conectar e inicializar
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
