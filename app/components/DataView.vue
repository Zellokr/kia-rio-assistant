<script setup lang="ts">
import type { ObdSessionState } from '~~/core/obd/session/ObdSessionStateMachine'
import type { ObdTelemetryMetric } from '~~/core/obd/telemetry/ObdTelemetryStore'

export type DataViewTransportChoice = 'mock' | 'replay' | 'web-serial-rfcomm'

defineProps<{
  sessionState: ObdSessionState
  telemetryRunning: boolean
  engineRpmMetric: ObdTelemetryMetric | undefined
  vehicleSpeedMetric: ObdTelemetryMetric | undefined
  coolantTemperatureMetric: ObdTelemetryMetric | undefined
  engineLoadMetric: ObdTelemetryMetric | undefined
  throttlePositionMetric: ObdTelemetryMetric | undefined
  supportedPids: string[]
  commands: string[]
  selectedCommand: string
  transportChoice: DataViewTransportChoice
}>()

const emit = defineEmits<{
  'update:selectedCommand': [string]
  'back-to-connection': []
  'start-telemetry': []
  'stop-telemetry': []
  'send-command': []
  'run-queue-test': []
}>()
</script>

<template>
  <section
    class="flex flex-col gap-4"
    aria-labelledby="data-view-title"
  >
    <div class="flex flex-col gap-1 px-1">
      <p class="text-sm font-medium text-primary">
        Vehículo estacionado
      </p>
      <h1
        id="data-view-title"
        class="text-2xl font-bold tracking-tight text-highlighted"
      >
        Datos del vehículo
      </h1>
      <p class="text-sm text-muted">
        Prioriza las métricas esenciales y consulta el resto cuando lo necesites.
      </p>
    </div>

    <UCard v-if="sessionState !== 'ready'">
      <div class="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
        <span class="flex size-14 items-center justify-center rounded-full bg-elevated text-muted">
          <UIcon
            name="i-lucide-plug"
            class="size-7"
            aria-hidden="true"
          />
        </span>
        <div class="flex max-w-sm flex-col gap-1">
          <h2 class="text-lg font-semibold text-highlighted">
            Primero prepara una conexión
          </h2>
          <p class="text-sm text-muted">
            Las métricas permanecerán ocultas hasta que la sesión esté preparada.
          </p>
        </div>
        <UButton
          color="primary"
          size="lg"
          icon="i-lucide-arrow-left"
          class="min-h-12 justify-center"
          @click="emit('back-to-connection')"
        >
          Ir a Conexión
        </UButton>
      </div>
    </UCard>

    <template v-else>
      <UCard>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center rounded-xl bg-success/10 text-success">
              <UIcon
                name="i-lucide-activity"
                class="size-5"
                aria-hidden="true"
              />
            </span>
            <div>
              <h2 class="font-semibold text-highlighted">
                Telemetría
              </h2>
              <p class="text-sm text-muted">
                {{ telemetryRunning ? 'Actualización activa' : 'Detenida hasta que tú la inicies' }}
              </p>
            </div>
          </div>
          <UButton
            v-if="!telemetryRunning"
            color="success"
            size="lg"
            icon="i-lucide-play"
            class="min-h-12 justify-center"
            @click="emit('start-telemetry')"
          >
            Iniciar telemetría
          </UButton>
          <UButton
            v-else
            color="neutral"
            variant="soft"
            size="lg"
            icon="i-lucide-square"
            class="min-h-12 justify-center"
            @click="emit('stop-telemetry')"
          >
            Detener telemetría
          </UButton>
        </div>
      </UCard>

      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <UCard>
          <div class="flex min-h-36 flex-col justify-between gap-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-muted">RPM</span>
              <UIcon
                name="i-lucide-gauge"
                class="size-5 text-primary"
                aria-hidden="true"
              />
            </div>
            <div>
              <span class="font-mono text-4xl font-bold tabular-nums text-highlighted">
                {{ engineRpmMetric ? Math.round(engineRpmMetric.value) : '—' }}
              </span>
              <span
                v-if="engineRpmMetric"
                class="ml-1 text-xs text-muted"
              >rpm</span>
            </div>
            <span class="text-xs text-muted">
              {{ engineRpmMetric ? `${engineRpmMetric.latencyMs} ms` : 'Sin muestra' }}
            </span>
          </div>
        </UCard>

        <UCard>
          <div class="flex min-h-36 flex-col justify-between gap-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-muted">Velocidad</span>
              <UIcon
                name="i-lucide-navigation"
                class="size-5 text-primary"
                aria-hidden="true"
              />
            </div>
            <div>
              <span class="font-mono text-4xl font-bold tabular-nums text-highlighted">
                {{ vehicleSpeedMetric ? Math.round(vehicleSpeedMetric.value) : '—' }}
              </span>
              <span
                v-if="vehicleSpeedMetric"
                class="ml-1 text-xs text-muted"
              >km/h</span>
            </div>
            <span class="text-xs text-muted">
              {{ vehicleSpeedMetric ? `${vehicleSpeedMetric.latencyMs} ms` : 'Sin muestra' }}
            </span>
          </div>
        </UCard>
      </div>

      <details class="group rounded-xl border border-default bg-default">
        <summary class="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <UIcon
            name="i-lucide-chart-no-axes-column-increasing"
            class="size-5 text-primary"
            aria-hidden="true"
          />
          <span class="flex-1 font-semibold text-highlighted">Más datos del motor</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-5 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <div class="grid gap-3 border-t border-default p-4 sm:grid-cols-3">
          <div class="rounded-xl bg-elevated p-4">
            <p class="text-sm text-muted">
              Refrigerante
            </p>
            <p class="mt-2 font-mono text-2xl font-bold tabular-nums text-highlighted">
              {{ coolantTemperatureMetric ? `${coolantTemperatureMetric.value} °C` : '—' }}
            </p>
          </div>
          <div class="rounded-xl bg-elevated p-4">
            <p class="text-sm text-muted">
              Carga del motor
            </p>
            <p class="mt-2 font-mono text-2xl font-bold tabular-nums text-highlighted">
              {{ engineLoadMetric ? `${engineLoadMetric.value.toFixed(1)} %` : '—' }}
            </p>
          </div>
          <div class="rounded-xl bg-elevated p-4">
            <p class="text-sm text-muted">
              Acelerador
            </p>
            <p class="mt-2 font-mono text-2xl font-bold tabular-nums text-highlighted">
              {{ throttlePositionMetric ? `${throttlePositionMetric.value.toFixed(1)} %` : '—' }}
            </p>
          </div>
        </div>
      </details>

      <details class="group rounded-xl border border-default bg-default">
        <summary class="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <UIcon
            name="i-lucide-terminal"
            class="size-5 text-primary"
            aria-hidden="true"
          />
          <span class="flex-1">
            <span class="block font-semibold text-highlighted">Consultas manuales</span>
            <span class="block text-sm text-muted">Un único comando permitido cada vez</span>
          </span>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-5 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <div class="flex flex-col gap-4 border-t border-default p-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium text-highlighted">PIDs compatibles</span>
            <UBadge
              v-for="pid in supportedPids"
              :key="pid"
              color="neutral"
              variant="outline"
            >
              {{ pid }}
            </UBadge>
            <span
              v-if="supportedPids.length === 0"
              class="text-sm text-muted"
            >Ninguno descubierto</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
            <div class="flex flex-col gap-2">
              <label
                for="manual-command"
                class="text-sm font-medium text-highlighted"
              >
                Comando permitido
              </label>
              <USelect
                id="manual-command"
                :model-value="selectedCommand"
                :items="commands"
                size="lg"
                class="w-full"
                @update:model-value="(value) => emit('update:selectedCommand', String(value))"
              />
            </div>
            <UButton
              color="primary"
              size="lg"
              icon="i-lucide-send"
              class="min-h-12 justify-center"
              @click="emit('send-command')"
            >
              Enviar
            </UButton>
            <UButton
              v-if="transportChoice !== 'web-serial-rfcomm'"
              color="warning"
              variant="soft"
              size="lg"
              icon="i-lucide-list-checks"
              class="min-h-12 justify-center"
              @click="emit('run-queue-test')"
            >
              Probar cola
            </UButton>
          </div>
        </div>
      </details>
    </template>
  </section>
</template>
