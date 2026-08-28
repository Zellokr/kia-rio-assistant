<script setup lang="ts">
import { inject } from 'vue'

import { VEEPEAK_BLE_PROFILE } from '~/services/veepeakBleProfile'
import { useElmPipeProbe } from '~/composables/useElmPipeProbe'
import {
  androidBleBridgeKey,
  defaultAndroidBleBridge
} from '~/utils/bleServiceKeys'

const bridge = inject(androidBleBridgeKey, defaultAndroidBleBridge)

const {
  busy,
  confirmed,
  response,
  statusMessage,
  errorMessage,
  run
} = useElmPipeProbe(bridge, VEEPEAK_BLE_PROFILE)

const supported = bridge.isSupported()
</script>

<template>
  <UCard>
    <div class="flex flex-col gap-5">
      <div class="flex items-start gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UIcon
            name="i-lucide-plug"
            class="size-5"
            aria-hidden="true"
          />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-semibold text-highlighted">
              Sonda de tubería BLE
            </h2>
            <UBadge
              color="success"
              variant="subtle"
              icon="i-lucide-shield-check"
            >
              No comunica con el vehículo
            </UBadge>
          </div>
          <p class="mt-1 text-sm leading-5 text-muted">
            Envía un único <code>ATZ</code>, que responde el propio chip
            ELM327. Confirma si los UUID revisados son la tubería correcta.
          </p>
        </div>
      </div>

      <UAlert
        v-if="!supported"
        color="neutral"
        variant="soft"
        icon="i-lucide-smartphone"
        title="Abre esta sección desde la aplicación Android"
        description="El navegador web no puede abrir el puente BLE nativo."
      />

      <template v-else>
        <dl class="grid gap-2 rounded-xl border border-default bg-elevated p-4 text-sm">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <dt class="text-muted">
              Servicio
            </dt>
            <dd class="font-mono text-xs text-highlighted">
              {{ VEEPEAK_BLE_PROFILE.serviceUuid }}
            </dd>
          </div>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <dt class="text-muted">
              Escritura (TX)
            </dt>
            <dd class="font-mono text-xs text-highlighted">
              {{ VEEPEAK_BLE_PROFILE.writeCharacteristicUuid }}
            </dd>
          </div>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <dt class="text-muted">
              Notificación (RX)
            </dt>
            <dd class="font-mono text-xs text-highlighted">
              {{ VEEPEAK_BLE_PROFILE.notifyCharacteristicUuid }}
            </dd>
          </div>
        </dl>

        <UButton
          color="primary"
          size="xl"
          block
          icon="i-lucide-radio"
          class="min-h-12 justify-center"
          :loading="busy"
          :disabled="busy"
          @click="run()"
        >
          Enviar ATZ
        </UButton>

        <UAlert
          v-if="confirmed"
          color="success"
          variant="subtle"
          icon="i-lucide-check-circle-2"
          title="Tubería confirmada"
          :description="statusMessage"
        />

        <p
          v-else-if="statusMessage"
          class="text-sm text-muted"
          role="status"
        >
          {{ statusMessage }}
        </p>

        <div
          v-if="response"
          class="flex flex-col gap-1"
        >
          <span class="text-xs font-medium uppercase tracking-wide text-muted">
            Respuesta del adaptador
          </span>
          <pre class="overflow-x-auto rounded-xl border border-default bg-elevated p-3 font-mono text-xs text-highlighted">{{ response }}</pre>
        </div>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="La sonda no pudo completarse"
          :description="errorMessage"
        />
      </template>
    </div>
  </UCard>
</template>
