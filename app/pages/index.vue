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
import DiagnosticsView from '~/components/DiagnosticsView.vue'
import LogView from '~/components/LogView.vue'
import NavRail from '~/components/NavRail.vue'
import WarningLightsView from '~/components/WarningLightsView.vue'

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
  telegramEnabled,
  sendToTelegram,
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

/**
 * TEMPORARY — field-test evidence delivery. Remove with
 * `app/services/telegramFieldLog.ts`.
 */
async function sendLogToTelegram(): Promise<void> {
  logCopyStatus.value = 'Enviando a Telegram…'
  logCopyStatus.value = await sendToTelegram()
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
            <!--
              A short persistent marker, not an explanation. The line under
              it read "Sin Mode 04, programación ni escritura en ECU" — a
              promise written in the vocabulary of the thing it promises
              about, on every screen. The full explanation now lives once,
              in plain language, on the connection view where a driver is
              deciding whether to trust this.
            -->
            <p class="min-w-0 font-semibold text-highlighted">
              Solo lectura
            </p>
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

        <DiagnosticsView
          v-else-if="activeView === 'diagnostics'"
          :busy="diagnostics.busy.value"
          :adapter-connected="sessionState === 'ready'"
          :error-message="diagnostics.errorMessage.value"
          :assessment="diagnostics.assessment.value"
          :reads="diagnostics.reads.value"
          @back-to-connection="activeView = 'connection'"
          @read-stored="readDiagnosticTroubleCodes('stored')"
          @read-pending="readDiagnosticTroubleCodes('pending')"
          @read-permanent="readDiagnosticTroubleCodes('permanent')"
          @reset="diagnostics.reset()"
        />

        <WarningLightsView
          v-else-if="activeView === 'warnings'"
          :catalog="kiaRioWarningLightsCatalog"
          :adapter-connected="sessionState === 'ready'"
        />

        <LogView
          v-else-if="activeView === 'log'"
          :events="sessionEvents"
          :dropped-events="droppedEvents"
          :truncated="logTruncated"
          :copy-status="logCopyStatus"
          :telegram-enabled="telegramEnabled"
          @export="downloadSessionLog"
          @copy="copyLog"
          @clear="clearLog"
          @telegram="sendLogToTelegram"
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
