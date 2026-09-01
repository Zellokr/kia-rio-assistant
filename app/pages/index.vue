<script setup lang="ts">
import { ref, watch } from 'vue'

import {
  kiaRioWarningLightsCatalog
} from '~~/catalog/kia-rio/warning-lights'
import {
  watchAssessmentPersistence
} from '~/composables/useAssessmentPersistence'
import { useDiagnosticAnnouncements } from '~/composables/useDiagnosticAnnouncements'
import { useObdLabSession } from '~/composables/useObdLabSession'
import { useSessionStateBeacon } from '~/composables/useSessionStateBeacon'
import { labViews } from '~/utils/labNav'
import type { LabViewId } from '~/utils/labNav'
import {
  MAX_ASSISTANT_HISTORY_TURNS,
  buildAssistantRequest
} from '~~/core/assistant/buildAssistantRequest'
import type {
  AssistantTurn
} from '~~/core/assistant/buildAssistantRequest'
import {
  resolveAssistantAnswer
} from '~~/core/assistant/resolveAssistantAnswer'
import {
  createRemoteAssistantProvider
} from '~/services/remoteAssistantProvider'
import type {
  AssistantAnswer
} from '~~/core/assistant/resolveAssistantAnswer'
import type { QuickCommandIntent } from '~~/core/assistant/parseQuickCommand'
import type {
  ObdTelemetryMetric
} from '~~/core/obd/telemetry/ObdTelemetryStore'
import AssistantAnswerPanel from '~/components/AssistantAnswerPanel.vue'
import AssistantCommandBar from '~/components/AssistantCommandBar.vue'
import type {
  AssistantCommandQuery
} from '~/components/AssistantCommandBar.vue'
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
  diagnostics,
  selectDevice,
  connect,
  disconnect,
  startTelemetry,
  stopTelemetry,
  sendCommand,
  runQueueTest,
  readDiagnosticTroubleCodes,
  persistAssessment
} = session

/**
 * Speaks the assessment when it changes, if the driver has turned the voice
 * on. The toggle lives in the layout and defaults to off, so this is silent
 * until it is asked for.
 */
useDiagnosticAnnouncements(diagnostics.assessment)
watchAssessmentPersistence(diagnostics.assessment, persistAssessment)

/**
 * Publishes the session state for the header, which renders outside this
 * page and so cannot reach the composable that owns it.
 */
const sessionStateBeacon = useSessionStateBeacon()

watch(sessionState, (state) => {
  sessionStateBeacon.value = state
}, { immediate: true })

const runtimeConfig = useRuntimeConfig()
const remoteAssistantAsk = createRemoteAssistantProvider({
  endpointUrl: runtimeConfig.public.assistant.endpointUrl
})

const activeView = ref<LabViewId>('connection')
const assistantAnswer = ref<AssistantAnswer | null>(null)
const assistantPending = ref(false)
const assistantHistory = ref<AssistantTurn[]>([])
let assistantRequestSequence = 0

function setActiveView(view: LabViewId): void {
  activeView.value = view
}

function clearAssistantAnswer(): void {
  assistantRequestSequence++
  assistantPending.value = false
  assistantAnswer.value = null
}

function definedTelemetryMetrics(): ObdTelemetryMetric[] {
  return [
    telemetry.value.engineRpm,
    telemetry.value.vehicleSpeed,
    telemetry.value.coolantTemperature,
    telemetry.value.engineLoad,
    telemetry.value.throttlePosition
  ].filter((metric): metric is ObdTelemetryMetric => metric !== undefined)
}

async function answerAssistantQuery(
  query: AssistantCommandQuery
): Promise<void> {
  const request = buildAssistantRequest({
    query: { text: query.text, intent: null },
    assessment: diagnostics.assessment.value,
    telemetry: definedTelemetryMetrics(),
    history: assistantHistory.value,
    nowMs: Date.now()
  })

  if (!request) {
    return
  }

  const sequence = ++assistantRequestSequence
  assistantPending.value = true

  try {
    const answer = await resolveAssistantAnswer({
      request,
      ask: remoteAssistantAsk
    })

    if (sequence !== assistantRequestSequence) {
      return
    }

    const newTurns: AssistantTurn[] = [
      { role: 'user', text: request.query.text },
      { role: 'assistant', text: answer.text }
    ]

    assistantAnswer.value = answer
    assistantHistory.value = [
      ...assistantHistory.value,
      ...newTurns
    ].slice(-MAX_ASSISTANT_HISTORY_TURNS)
  } catch (error) {
    if (sequence !== assistantRequestSequence) {
      return
    }

    assistantAnswer.value = {
      text: 'No pude preparar la respuesta local. Inténtalo de nuevo con una pregunta más concreta.',
      source: 'local-template',
      reasons: [{
        kind: 'provider-failed',
        message: error instanceof Error ? error.message : 'error desconocido'
      }]
    }
  } finally {
    if (sequence === assistantRequestSequence) {
      assistantPending.value = false
    }
  }
}

/**
 * Carries out a quick command from the assistant bar (§11).
 *
 * Every branch lands the driver on the screen that answers the question,
 * because the spoken or typed reply is a summary and the detail lives in the
 * view. `save-note` cannot arrive: the bar refuses it, since notes are a
 * Fase 4 maintenance record this app cannot write.
 */
function runAssistantCommand(intent: QuickCommandIntent): void {
  clearAssistantAnswer()

  switch (intent) {
    case 'status':
      activeView.value = 'connection'
      break

    case 'read-dtc':
      activeView.value = 'diagnostics'
      void readDiagnosticTroubleCodes('stored')
      break

    case 'temperature':
      activeView.value = 'data'
      break

    case 'warning-light':
      activeView.value = 'warnings'
      break

    case 'save-note':
      break
  }
}

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
        <!--
          One claim, once. This strip carried the session state as a badge
          beside it, so "Sin conexión" appeared twice on the connection view
          — here in miniature and again in ConnectionStatus, which says it
          with a colour, an icon, a sentence and its progress. The marker
          that earns its place on every screen is the read-only one.
        -->
        <div class="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <UIcon
            name="i-lucide-shield-alert"
            class="mt-0.5 size-5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div class="min-w-0">
            <p class="font-semibold text-highlighted">
              Solo lectura, vehículo estacionado
            </p>
            <p class="text-sm leading-6 text-muted">
              App OBD de solo lectura: no borra códigos ni escribe en la ECU. Consulta las lecturas con el coche parado y sin usarla mientras conduces.
            </p>
          </div>
        </div>

        <AssistantAnswerPanel
          :answer="assistantAnswer"
          :pending="assistantPending"
        />

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
          @copy="copyLog"
          @clear="clearLog"
        />
      </UContainer>
    </div>

    <AssistantCommandBar
      @command="runAssistantCommand"
      @query="answerAssistantQuery"
    />

    <BottomTabBar
      :views="labViews"
      :active="activeView"
      @select="setActiveView"
    />
  </main>
</template>
