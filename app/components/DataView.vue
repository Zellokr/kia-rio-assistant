<script setup lang="ts">
import type { ObdSessionState } from '~~/core/obd/session/ObdSessionStateMachine'
import { computed, onScopeDispose, ref } from 'vue'

import { isPhysicalTransportKind } from '~~/core/obd/transport/ObdTransport'
import type {
  ObdTelemetryMetric
} from '~~/core/obd/telemetry/ObdTelemetryStore'
import type {
  ObdTelemetryMetrics
} from '~/composables/useObdTelemetry'
import { describeMetricFreshness } from '~/utils/telemetryAge'
import type { ObdTransportChoice } from '~/utils/obdTransportChoice'

const props = defineProps<{
  sessionState: ObdSessionState
  telemetryRunning: boolean
  telemetry: ObdTelemetryMetrics
  supportedPids: string[]
  commands: string[]
  selectedCommand: string
  transportChoice: ObdTransportChoice
}>()

/**
 * A reading's age has to advance on its own. Nothing changes in the store
 * while polling is stopped, so without a clock of its own the display would
 * freeze at whatever age it had when the last value arrived — which is the
 * exact failure this is here to remove.
 */
const nowMs = ref(Date.now())
const clock = setInterval(() => {
  nowMs.value = Date.now()
}, 1000)

onScopeDispose(() => clearInterval(clock))

function freshness(metric: ObdTelemetryMetric | undefined) {
  return describeMetricFreshness(metric, nowMs.value)
}

/**
 * Whether any reading on screen has gone stale. One quiet line above the
 * cards is easier to catch than five separate ones, and it is what says the
 * link is gone rather than the engine being still.
 */
const anyStale = computed(() => {
  const metrics = [
    props.telemetry.engineRpm,
    props.telemetry.vehicleSpeed,
    props.telemetry.coolantTemperature,
    props.telemetry.engineLoad,
    props.telemetry.throttlePosition
  ]

  return metrics.some(metric => freshness(metric).stale)
})

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
        Lecturas en directo
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
                Lecturas en directo
              </h2>
              <p class="text-sm text-muted">
                {{ telemetryRunning ? 'Actualización activa' : 'Detenidas hasta que tú las inicies' }}
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
            Ver lecturas
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
            Pausar lecturas
          </UButton>
        </div>
      </UCard>

      <!--
        The link going quiet has to be said, not inferred from numbers that
        stopped changing. Frozen readings used to look exactly like live
        ones — the same bold value over a plausible latency.
      -->
      <UAlert
        v-if="anyStale"
        color="warning"
        variant="soft"
        icon="i-lucide-wifi-off"
        title="Lecturas sin actualizar"
        description="El coche ha dejado de responder. Los números de abajo son los últimos recibidos, no los de ahora."
      />

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
              <span
                class="font-mono text-4xl font-bold tabular-nums transition-colors"
                :class="freshness(telemetry.engineRpm).stale ? 'text-muted/60' : 'text-highlighted'"
              >
                {{ telemetry.engineRpm ? Math.round(telemetry.engineRpm.value) : '—' }}
              </span>
              <span
                v-if="telemetry.engineRpm"
                class="ml-1 text-xs text-muted"
              >rpm</span>
            </div>
            <span
              class="text-xs"
              :class="freshness(telemetry.engineRpm).stale ? 'font-medium text-warning' : 'text-muted'"
            >
              {{ telemetry.engineRpm ? freshness(telemetry.engineRpm).label : 'Sin muestra' }}
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
              <span
                class="font-mono text-4xl font-bold tabular-nums transition-colors"
                :class="freshness(telemetry.vehicleSpeed).stale ? 'text-muted/60' : 'text-highlighted'"
              >
                {{ telemetry.vehicleSpeed ? Math.round(telemetry.vehicleSpeed.value) : '—' }}
              </span>
              <span
                v-if="telemetry.vehicleSpeed"
                class="ml-1 text-xs text-muted"
              >km/h</span>
            </div>
            <span
              class="text-xs"
              :class="freshness(telemetry.vehicleSpeed).stale ? 'font-medium text-warning' : 'text-muted'"
            >
              {{ telemetry.vehicleSpeed ? freshness(telemetry.vehicleSpeed).label : 'Sin muestra' }}
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
          <span class="flex-1 font-semibold text-highlighted">Más lecturas</span>
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
            <p
              class="mt-2 font-mono text-2xl font-bold tabular-nums transition-colors"
              :class="freshness(telemetry.coolantTemperature).stale ? 'text-muted/60' : 'text-highlighted'"
            >
              {{ telemetry.coolantTemperature ? `${telemetry.coolantTemperature.value} °C` : '—' }}
            </p>
            <p
              class="mt-1 text-xs"
              :class="freshness(telemetry.coolantTemperature).stale ? 'font-medium text-warning' : 'text-muted'"
            >
              {{ telemetry.coolantTemperature ? freshness(telemetry.coolantTemperature).label : 'Sin muestra' }}
            </p>
          </div>
          <div class="rounded-xl bg-elevated p-4">
            <p class="text-sm text-muted">
              Carga del motor
            </p>
            <p
              class="mt-2 font-mono text-2xl font-bold tabular-nums transition-colors"
              :class="freshness(telemetry.engineLoad).stale ? 'text-muted/60' : 'text-highlighted'"
            >
              {{ telemetry.engineLoad ? `${telemetry.engineLoad.value.toFixed(1)} %` : '—' }}
            </p>
            <p
              class="mt-1 text-xs"
              :class="freshness(telemetry.engineLoad).stale ? 'font-medium text-warning' : 'text-muted'"
            >
              {{ telemetry.engineLoad ? freshness(telemetry.engineLoad).label : 'Sin muestra' }}
            </p>
          </div>
          <div class="rounded-xl bg-elevated p-4">
            <p class="text-sm text-muted">
              Acelerador
            </p>
            <p
              class="mt-2 font-mono text-2xl font-bold tabular-nums transition-colors"
              :class="freshness(telemetry.throttlePosition).stale ? 'text-muted/60' : 'text-highlighted'"
            >
              {{ telemetry.throttlePosition ? `${telemetry.throttlePosition.value.toFixed(1)} %` : '—' }}
            </p>
            <p
              class="mt-1 text-xs"
              :class="freshness(telemetry.throttlePosition).stale ? 'font-medium text-warning' : 'text-muted'"
            >
              {{ telemetry.throttlePosition ? freshness(telemetry.throttlePosition).label : 'Sin muestra' }}
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
            <span class="block font-semibold text-highlighted">Lecturas disponibles</span>
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
              v-if="!isPhysicalTransportKind(transportChoice)"
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
