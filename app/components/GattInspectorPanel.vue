<script setup lang="ts">
import { inject } from 'vue'

import { useGattInspector } from '~/composables/useGattInspector'
import {
  defaultGattInspectorBridge,
  gattInspectorBridgeKey
} from '~/utils/bleServiceKeys'

const bridge = inject(gattInspectorBridgeKey, defaultGattInspectorBridge)

const {
  supported,
  devices,
  selectedDeviceId,
  selectedDevice,
  inventory,
  busy,
  errorMessage,
  statusMessage,
  scan,
  inspect,
  disconnect
} = useGattInspector(bridge)

async function copyInventory(): Promise<void> {
  if (!inventory.value) return

  try {
    await navigator.clipboard.writeText(
      JSON.stringify(inventory.value, null, 2)
    )
    statusMessage.value = 'Inventario copiado al portapapeles'
  } catch (error) {
    errorMessage.value = toMessage(error)
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
</script>

<template>
  <UCard>
    <div class="flex flex-col gap-5">
      <div class="flex items-start gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UIcon
            name="i-lucide-bluetooth"
            class="size-5"
            aria-hidden="true"
          />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-semibold text-highlighted">
              Inventario Bluetooth
            </h2>
            <UBadge
              color="success"
              variant="subtle"
              icon="i-lucide-shield-check"
            >
              No lee ni escribe datos del vehículo
            </UBadge>
          </div>
          <p class="mt-1 text-sm leading-5 text-muted">
            Identifica los servicios que anuncia el VEEPEAK sin enviar comandos OBD.
          </p>
        </div>
      </div>

      <UAlert
        v-if="!supported"
        color="neutral"
        variant="soft"
        icon="i-lucide-smartphone"
        title="Abre esta sección desde la aplicación Android"
        description="El navegador web no puede cargar el inspector GATT nativo."
      />

      <template v-else>
        <ol
          class="grid grid-cols-3 gap-2"
          aria-label="Progreso del inventario Bluetooth"
        >
          <li class="flex min-w-0 flex-col items-center gap-2 text-center">
            <span
              class="flex size-8 items-center justify-center rounded-full text-sm font-bold"
              :class="devices.length === 0 ? 'bg-primary text-inverted' : 'bg-success/10 text-success'"
            >1</span>
            <span class="text-xs font-medium text-muted">Buscar</span>
          </li>
          <li class="flex min-w-0 flex-col items-center gap-2 text-center">
            <span
              class="flex size-8 items-center justify-center rounded-full text-sm font-bold"
              :class="devices.length > 0 && !selectedDeviceId ? 'bg-primary text-inverted' : selectedDeviceId ? 'bg-success/10 text-success' : 'bg-elevated text-muted'"
            >2</span>
            <span class="text-xs font-medium text-muted">Elegir</span>
          </li>
          <li class="flex min-w-0 flex-col items-center gap-2 text-center">
            <span
              class="flex size-8 items-center justify-center rounded-full text-sm font-bold"
              :class="selectedDeviceId && !inventory ? 'bg-primary text-inverted' : inventory ? 'bg-success/10 text-success' : 'bg-elevated text-muted'"
            >3</span>
            <span class="text-xs font-medium text-muted">Descubrir</span>
          </li>
        </ol>

        <div
          v-if="devices.length === 0"
          class="flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border border-default bg-elevated p-5 text-center"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UIcon
              name="i-lucide-bluetooth-searching"
              class="size-7"
              aria-hidden="true"
            />
          </span>
          <div class="flex max-w-sm flex-col gap-1">
            <h3 class="font-semibold text-highlighted">
              1. Buscar adaptador
            </h3>
            <p class="text-sm text-muted">
              El escaneo dura cinco segundos y solo conserva dispositivos identificados como VEEPEAK.
            </p>
          </div>
          <UButton
            color="primary"
            size="xl"
            block
            icon="i-lucide-bluetooth-searching"
            class="min-h-12 max-w-sm justify-center"
            :loading="busy"
            :disabled="busy"
            @click="scan"
          >
            Buscar VEEPEAK
          </UButton>
        </div>

        <div
          v-else-if="!selectedDeviceId"
          class="flex flex-col gap-4 rounded-xl border border-default bg-elevated p-4"
        >
          <div class="flex flex-col gap-1">
            <h3 class="font-semibold text-highlighted">
              2. Elegir dispositivo
            </h3>
            <p class="text-sm text-muted">
              Comprueba el nombre y la dirección. La aplicación nunca elige por ti.
            </p>
          </div>
          <div class="flex flex-col gap-2">
            <label
              for="gatt-device"
              class="text-sm font-medium text-highlighted"
            >
              Dispositivo VEEPEAK detectado
            </label>
            <select
              id="gatt-device"
              v-model="selectedDeviceId"
              class="min-h-12 w-full rounded-lg border border-default bg-default px-3 text-base text-highlighted outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
              :disabled="busy"
            >
              <option value="">
                Selecciona explícitamente
              </option>
              <option
                v-for="device in devices"
                :key="device.id"
                :value="device.id"
              >
                {{ device.name || 'VEEPEAK' }} · {{ device.id }} · {{ device.rssi ?? '?' }} dBm
              </option>
            </select>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="lg"
            icon="i-lucide-refresh-cw"
            class="min-h-12 justify-center"
            :loading="busy"
            :disabled="busy"
            @click="scan"
          >
            Buscar de nuevo
          </UButton>
        </div>

        <div
          v-else-if="!inventory"
          class="flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border border-default bg-elevated p-5 text-center"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UIcon
              name="i-lucide-list-tree"
              class="size-7"
              aria-hidden="true"
            />
          </span>
          <div class="flex max-w-sm flex-col gap-1">
            <h3 class="font-semibold text-highlighted">
              3. Descubrir servicios
            </h3>
            <p class="text-sm text-muted">
              {{ selectedDevice?.name || 'VEEPEAK' }} · {{ selectedDevice?.id }}
            </p>
            <p class="text-sm text-muted">
              Se enumerarán UUID, propiedades y descriptores. No se leerán valores.
            </p>
          </div>
          <UButton
            color="primary"
            size="xl"
            block
            icon="i-lucide-list-tree"
            class="min-h-12 max-w-sm justify-center"
            :loading="busy"
            :disabled="busy"
            @click="inspect"
          >
            Descubrir inventario
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="lg"
            class="min-h-12 justify-center"
            :disabled="busy"
            @click="selectedDeviceId = ''"
          >
            Elegir otro dispositivo
          </UButton>
        </div>

        <div
          v-else
          class="flex flex-col gap-4 rounded-xl border border-success/30 bg-success/5 p-4"
        >
          <div class="flex items-start gap-3">
            <UIcon
              name="i-lucide-circle-check"
              class="mt-0.5 size-5 shrink-0 text-success"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold text-highlighted">
                Inventario completado
              </h3>
              <p class="text-sm text-muted">
                Copia el JSON completo para revisar el contrato GATT antes de integrar el transporte.
              </p>
            </div>
          </div>
          <UButton
            color="primary"
            variant="soft"
            size="lg"
            icon="i-lucide-copy"
            class="min-h-12 justify-center"
            @click="copyInventory"
          >
            Copiar inventario
          </UButton>
          <details class="group rounded-lg border border-default bg-default">
            <summary class="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-highlighted">
              <span class="flex-1">Ver JSON raw</span>
              <UIcon
                name="i-lucide-chevron-down"
                class="size-4 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <pre
              class="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-terminal-border bg-terminal p-3 font-mono text-xs leading-5 text-terminal-foreground"
              aria-label="Inventario GATT en JSON"
            >{{ JSON.stringify(inventory, null, 2) }}</pre>
          </details>
        </div>

        <UAlert
          v-if="statusMessage"
          :color="inventory ? 'success' : 'neutral'"
          variant="soft"
          icon="i-lucide-info"
          title="Estado de la inspección"
          :description="statusMessage"
        />
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          title="La inspección se ha detenido"
          :description="errorMessage"
        />

        <UButton
          v-if="selectedDeviceId || inventory"
          color="neutral"
          variant="outline"
          size="lg"
          icon="i-lucide-unplug"
          class="min-h-12 justify-center"
          :disabled="busy"
          @click="disconnect"
        >
          Desconectar Bluetooth
        </UButton>
      </template>
    </div>
  </UCard>
</template>
