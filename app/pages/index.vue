<script setup lang="ts">
import { ref, watch } from 'vue'

import {
  kiaRioWarningLightsCatalog
} from '~~/catalog/kia-rio/warning-lights'
import { useObdLabSession } from '~/composables/useObdLabSession'
import { useSessionStateBeacon } from '~/composables/useSessionStateBeacon'
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
  copySessionLog,
  telegramEnabled,
  sendFieldReport,
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

/**
 * Publishes the session state for the header, which renders outside this
 * page and so cannot reach the composable that owns it.
 */
const sessionStateBeacon = useSessionStateBeacon()

watch(sessionState, (state) => {
  sessionStateBeacon.value = state
}, { immediate: true })

const activeView = ref<LabViewId>('connection')

function setActiveView(view: LabViewId): void {
  activeView.value = view
}

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
  logCopyStatus.value = 'Componiendo y enviando el informe…'
  logCopyStatus.value = await sendFieldReport()
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
        <!--
          One claim, once. This strip carried the session state as a badge
          beside it, so "Sin conexión" appeared twice on the connection view
          — here in miniature and again in ConnectionStatus, which says it
          with a colour, an icon, a sentence and its progress. The marker
          that earns its place on every screen is the read-only one.
        -->
        <div class="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
          <UIcon
            name="i-lucide-shield-check"
            class="size-5 shrink-0 text-success"
            aria-hidden="true"
          />
          <p class="min-w-0 font-semibold text-highlighted">
            Solo lectura
          </p>
        </div>

        <ConnectionView
          v-if="activeView === 'connection'"
          v-model:transport-choice="transportChoice"
          :session-state="sessionState"
          :transport-error="transportError"
          :session-busy="sessionBusy"
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
          :reads="diagnostics.reads.value"
        />

        <LogView
          v-else-if="activeView === 'log'"
          :events="sessionEvents"
          :dropped-events="droppedEvents"
          :truncated="logTruncated"
          :copy-status="logCopyStatus"
          :telegram-enabled="telegramEnabled"
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
