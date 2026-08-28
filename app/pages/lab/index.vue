<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  kiaRioWarningLightsCatalog
} from '~~/catalog/kia-rio/warning-lights'
import type {
  ObdSessionState
} from '~~/core/obd/session/ObdSessionStateMachine'
import { useObdLabSession } from '~/composables/useObdLabSession'
import { labViews } from '~/utils/labNav'
import type { LabViewId } from '~/utils/labNav'
import BottomTabBar from '~/components/BottomTabBar.vue'
import ConnectionView from '~/components/ConnectionView.vue'
import DataView from '~/components/DataView.vue'
import DiagnosticAssessmentCard from '~/components/DiagnosticAssessmentCard.vue'
import LogView from '~/components/LogView.vue'
import NavRail from '~/components/NavRail.vue'
import WarningLightIdentifier from '~/components/WarningLightIdentifier.vue'

definePageMeta({
  alias: ['/']
})

/**
 * The page is a view again: it chooses which panel is on screen and how the
 * session's state reads in Spanish. Everything that talks to the adapter —
 * the transport, the executor, the poll scheduler, the log and persistence —
 * belongs to `useObdLabSession`, which can be driven without mounting a
 * component.
 */
const session = useObdLabSession()

const {
  sessionState,
  sessionBusy,
  transportState,
  transportChoice,
  transportError,
  supportedPids,
  telemetryRunning,
  selectedCommand,
  commands,
  telemetry,
  sessionEvents,
  droppedEvents,
  logTruncated,
  clearLog,
  downloadSessionLog,
  copySessionLog,
  diagnostics,
  selectDevice,
  connect,
  disconnect,
  startTelemetry,
  stopTelemetry,
  sendCommand,
  runQueueTest,
  readDiagnosticTroubleCodes
} = session

const activeView = ref<LabViewId>('connection')

function setActiveView(view: LabViewId): void {
  activeView.value = view
}

/**
 * Keyed by the full `ObdSessionState` union rather than by `string`, so a
 * state added to the machine is a build error here instead of a raw
 * identifier rendered at a driver.
 */
const SESSION_STATE_LABELS: Record<ObdSessionState, string> = {
  idle: 'Sin conexión',
  selecting: 'Seleccionando adaptador',
  selected: 'Adaptador seleccionado',
  connecting: 'Conectando',
  initializing: 'Inicializando ELM327',
  discovering: 'Descubriendo PIDs',
  ready: 'Preparado',
  reconnecting: 'Reconectando',
  disconnecting: 'Desconectando',
  disconnected: 'Desconectado',
  error: 'Necesita atención'
}

const SESSION_STATE_COLORS: Record<
  ObdSessionState,
  'neutral' | 'warning' | 'primary' | 'success' | 'error'
> = {
  idle: 'neutral',
  selecting: 'warning',
  selected: 'primary',
  connecting: 'warning',
  initializing: 'neutral',
  discovering: 'neutral',
  ready: 'success',
  reconnecting: 'warning',
  disconnecting: 'warning',
  disconnected: 'neutral',
  error: 'error'
}

const sessionStateLabel = computed(
  () => SESSION_STATE_LABELS[sessionState.value]
)

const sessionBadgeColor = computed(
  () => SESSION_STATE_COLORS[sessionState.value]
)

const logCopyStatus = ref('')

async function copyLog(): Promise<void> {
  const copied = await copySessionLog()

  logCopyStatus.value = copied
    ? 'Registro copiado al portapapeles'
    : 'No se pudo copiar. Concede acceso al portapapeles e inténtalo de nuevo.'
}
</script>

<template>
  <main class="pt-4 sm:pt-6 md:flex md:items-start">
    <NavRail
      :views="labViews"
      :active="activeView"
      @select="setActiveView"
    />

    <div class="min-w-0 flex-1 md:pr-[env(safe-area-inset-right)]">
      <UContainer class="flex max-w-3xl flex-col gap-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-0">
        <div class="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
          <div class="flex min-w-0 items-center gap-3">
            <UIcon
              name="i-lucide-shield-check"
              class="size-5 shrink-0 text-success"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <p class="font-semibold text-highlighted">
                Diagnóstico · Solo lectura
              </p>
              <p class="text-xs text-muted">
                Sin Mode 04, programación ni escritura en ECU
              </p>
            </div>
          </div>
          <UBadge
            :color="sessionBadgeColor"
            variant="subtle"
            class="shrink-0"
          >
            {{ sessionStateLabel }}
          </UBadge>
        </div>

        <ConnectionView
          v-if="activeView === 'connection'"
          v-model:transport-choice="transportChoice"
          :session-state="sessionState"
          :session-state-label="sessionStateLabel"
          :transport-state="transportState"
          :transport-error="transportError"
          :session-busy="sessionBusy"
          :session-badge-color="sessionBadgeColor"
          @select-device="selectDevice"
          @connect="connect"
          @disconnect="disconnect"
        />

        <DataView
          v-else-if="activeView === 'data'"
          v-model:selected-command="selectedCommand"
          :session-state="sessionState"
          :telemetry-running="telemetryRunning"
          :telemetry="telemetry"
          :supported-pids="supportedPids"
          :commands="commands"
          :transport-choice="transportChoice"
          @back-to-connection="activeView = 'connection'"
          @start-telemetry="startTelemetry"
          @stop-telemetry="stopTelemetry"
          @send-command="sendCommand"
          @run-queue-test="runQueueTest"
        />

        <template v-if="activeView === 'data'">
          <UCard>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1">
                <h2 class="text-lg font-semibold text-highlighted">
                  Leer códigos de avería
                </h2>
                <p class="text-sm leading-6 text-muted">
                  Lectura únicamente. Este laboratorio no borra códigos
                  ni escribe nada en la centralita.
                </p>
              </div>

              <div class="grid gap-2 sm:grid-cols-2">
                <UButton
                  color="primary"
                  variant="solid"
                  size="lg"
                  :disabled="diagnostics.busy.value"
                  @click="readDiagnosticTroubleCodes('stored')"
                >
                  Códigos almacenados
                </UButton>
                <UButton
                  color="neutral"
                  variant="soft"
                  size="lg"
                  :disabled="diagnostics.busy.value"
                  @click="readDiagnosticTroubleCodes('pending')"
                >
                  Códigos pendientes
                </UButton>
                <UButton
                  color="neutral"
                  variant="soft"
                  size="lg"
                  :disabled="diagnostics.busy.value"
                  @click="readDiagnosticTroubleCodes('permanent')"
                >
                  Códigos permanentes
                </UButton>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="lg"
                  :disabled="diagnostics.busy.value"
                  @click="diagnostics.reset()"
                >
                  Limpiar resultados
                </UButton>
              </div>

              <UAlert
                v-if="diagnostics.errorMessage.value"
                color="error"
                variant="soft"
                icon="i-lucide-triangle-alert"
                :description="diagnostics.errorMessage.value"
              />
            </div>
          </UCard>

          <DiagnosticAssessmentCard
            :assessment="diagnostics.assessment.value"
            :reads="diagnostics.reads.value"
          />

          <WarningLightIdentifier
            :catalog="kiaRioWarningLightsCatalog"
            :adapter-connected="sessionState === 'ready'"
          />
        </template>

        <LogView
          v-else
          :events="sessionEvents"
          :dropped-events="droppedEvents"
          :truncated="logTruncated"
          :copy-status="logCopyStatus"
          @export="downloadSessionLog"
          @copy="copyLog"
          @clear="clearLog"
        />
      </UContainer>
    </div>

    <BottomTabBar
      :views="labViews"
      :active="activeView"
      @select="setActiveView"
    />
  </main>
</template>
