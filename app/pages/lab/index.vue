<script setup lang="ts">
import { onBeforeUnmount, ref, computed } from 'vue'
import { MockObdTransport } from '~~/core/obd/transport/MockObdTransport'
import {
  buildReplayTranscript,
  ReplayObdTransport
} from '~~/core/obd/transport/ReplayObdTransport'
import {
  WebSerialRfcommTransport
} from '~~/core/obd/transport/WebSerialRfcommTransport'
import { ElmCommandExecutor } from '~~/core/obd/protocol/ElmCommandExecutor'
import { decodeMode01Response } from '~~/core/obd/decoder/decodeMode01Response'
import { decodeSupportedPids } from '~~/core/obd/decoder/decodeSupportedPids'
import { initializeElm327 } from '~~/core/obd/protocol/Elm327Initializer'
import {
  discoverSupportedPids
} from '~~/core/obd/protocol/SupportedPidDiscovery'
import {
  ObdSessionStateMachine
} from '~~/core/obd/session/ObdSessionStateMachine'
import {
  ObdPollScheduler
} from '~~/core/obd/polling/ObdPollScheduler'
import {
  decodeMode03Response
} from '~~/core/obd/decoder/decodeMode03Response'
import {
  ObdTelemetryStore
} from '~~/core/obd/telemetry/ObdTelemetryStore'
import {
  createSupportedTelemetryPollTasks
} from '~~/core/obd/telemetry/createSupportedTelemetryPollTasks'
import {
  ObdSessionLog
} from '~~/core/obd/logging/ObdSessionLog'
import {
  PHYSICAL_ALLOWED_COMMANDS
} from '~~/core/obd/policy/PhysicalObdCommandPolicy'
import type {
  ObdErrorPhase
} from '~~/core/obd/logging/ObdSessionLog'
import type {
  ObdTransport,
  ObdTransportMetadata
} from '~~/core/obd/transport/ObdTransport'

definePageMeta({
  alias: ['/']
})

let transport: ObdTransport = new MockObdTransport()
const sessionLog = new ObdSessionLog({
  transport: { kind: transport.kind }
})
let executor = new ElmCommandExecutor(
  transport,
  event => sessionLog.record(event)
)
const session = new ObdSessionStateMachine()
let pollScheduler = new ObdPollScheduler(executor)
const supportedPids = ref<string[]>([])
const telemetryRunning = ref(false)
const sessionState = ref(session.state)
const transportState = ref(transport.state)
const activeView = ref<'connection' | 'data' | 'log'>('connection')
const transportChoice = ref<
  'mock' | 'replay' | 'web-serial-rfcomm'
>('mock')
const replayFilename = ref('')
const replayImportError = ref('')
const transportError = ref('')
let replaySessionExport: unknown
const telemetryDomainStore
  = new ObdTelemetryStore()
let selectedTransport: ObdTransportMetadata = {
  kind: transport.kind
}

const {
  events: sessionEvents,
  droppedEvents,
  truncated: logTruncated,
  clearDisplay: clearLog,
  downloadJson: downloadSessionLog
} = useObdSessionLog(sessionLog)

const mobileViews = [
  {
    value: 'connection' as const,
    label: 'Conexión',
    icon: 'i-lucide-plug-zap'
  },
  {
    value: 'data' as const,
    label: 'Datos',
    icon: 'i-lucide-gauge'
  },
  {
    value: 'log' as const,
    label: 'Registro',
    icon: 'i-lucide-scroll-text'
  }
]

const sessionStateLabel = computed(() => {
  const labels: Record<string, string> = {
    idle: 'Sin conexión',
    selecting: 'Seleccionando adaptador',
    selected: 'Adaptador seleccionado',
    connecting: 'Conectando',
    initializing: 'Inicializando ELM327',
    discovering: 'Descubriendo PIDs',
    ready: 'Preparado',
    disconnecting: 'Desconectando',
    disconnected: 'Desconectado',
    error: 'Necesita atención'
  }

  return labels[String(sessionState.value)] ?? String(sessionState.value)
})

const sessionBusy = computed(() => {
  return [
    'selecting',
    'connecting',
    'initializing',
    'discovering',
    'disconnecting'
  ].includes(String(sessionState.value))
})

const {
  engineRpm: engineRpmMetric,
  coolantTemperature:
    coolantTemperatureMetric,
  engineLoad: engineLoadMetric,
  vehicleSpeed: vehicleSpeedMetric,
  throttlePosition: throttlePositionMetric,
  setSnapshot: setTelemetrySnapshot,
  clear: clearReactiveTelemetry
} = useObdTelemetry()

function syncTelemetryState(): void {
  setTelemetrySnapshot(
    telemetryDomainStore.getSnapshot()
  )
}

function clearTelemetryState(): void {
  telemetryDomainStore.clear()
  clearReactiveTelemetry()
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(String(error))
}

function recordError(
  error: unknown,
  phase: ObdErrorPhase,
  command?: string
): void {
  const normalizedError = toError(error)

  sessionLog.record({
    type: 'error',
    command,
    error: {
      name: normalizedError.name,
      message: normalizedError.message,
      phase
    }
  })
}

const sessionBadgeColor = computed(() => {
  switch (String(sessionState.value)) {
    case 'idle': return 'neutral'
    case 'selecting': return 'warning'
    case 'selected': return 'primary'
    case 'connecting': return 'warning'
    case 'initializing': return 'neutral'
    case 'discovering': return 'neutral'
    case 'ready': return 'success'
    case 'disconnecting': return 'warning'
    case 'disconnected': return 'neutral'
    case 'error': return 'error'
    default: return 'neutral'
  }
})

let unsubscribePollResult = () => {}
let unsubscribePollError = () => {}

function attachPollObservers(): void {
  unsubscribePollResult = pollScheduler.onResult(({ result }) => {
    try {
      const decoded = decodeMode01Response(
        result.normalizedText
      )

      if (decoded) {
        telemetryDomainStore.update(
          decoded,
          result
        )

        syncTelemetryState()

        sessionLog.record({
          type: 'decoded-value',
          source: 'telemetry',
          command: result.command,
          latencyMs: result.latencyMs,
          decoded: {
            kind: 'pid',
            ...decoded
          }
        })
      }
    } catch (error) {
      recordError(error, 'decode', result.command)
    }
  })

  unsubscribePollError = pollScheduler.onError(({ task, error }) => {
    recordError(error, 'poll', task.command)
  })
}

attachPollObservers()

function replaceTransport(next: ObdTransport): void {
  pollScheduler.stop()
  unsubscribePollResult()
  unsubscribePollError()
  executor.dispose()

  transport = next
  executor = new ElmCommandExecutor(
    transport,
    event => sessionLog.record(event)
  )
  pollScheduler = new ObdPollScheduler(executor)
  attachPollObservers()
  transportState.value = transport.state
}

function prepareSelectedTransport(): void {
  if (transportChoice.value === 'mock') {
    if (transport.kind !== 'mock') {
      replaceTransport(new MockObdTransport())
    }

    return
  }

  if (transportChoice.value === 'web-serial-rfcomm') {
    if (transport.kind !== 'web-serial-rfcomm') {
      replaceTransport(new WebSerialRfcommTransport())
    }

    return
  }

  if (replaySessionExport === undefined) {
    throw new Error(
      'Importa una sesión OBD antes de seleccionar Replay'
    )
  }

  replaceTransport(
    new ReplayObdTransport(replaySessionExport)
  )
}

async function importReplayFile(file: File): Promise<void> {
  replayImportError.value = ''
  replayFilename.value = ''
  replaySessionExport = undefined

  try {
    const parsed: unknown = JSON.parse(await file.text())

    buildReplayTranscript(parsed)
    replaySessionExport = parsed
    replayFilename.value = file.name
  } catch (error) {
    replayImportError.value = toError(error).message
  }
}
function transitionSession(
  next: Parameters<typeof session.transition>[0]
) {
  session.transition(next)
  sessionState.value = session.state

  sessionLog.record({
    type: 'session-state',
    state: session.state
  })
}

function failSession() {
  session.fail()
  sessionState.value = session.state

  sessionLog.record({
    type: 'session-state',
    state: session.state
  })
}

const simulatedCommands = [
  'ATZ',
  'ATE0',
  'ATL0',
  'ATS0',
  'ATH0',
  'ATSP0',
  '0100',
  '010C',
  '0105',
  '0120',
  '0199',
  '0198',
  '03TEST',
  '03',
  '0104',
  '010D',
  '0111'
]

const physicalCommands: string[] = [...PHYSICAL_ALLOWED_COMMANDS]

const commands = computed(() => (
  transportChoice.value === 'web-serial-rfcomm'
    ? physicalCommands
    : simulatedCommands
))

const selectedCommand = ref('ATZ')

async function runQueueTest() {
  sessionLog.record({
    type: 'activity',
    activity: 'queue-test-started'
  })

  const commandsToRun = [
    '010C',
    '0105',
    '03'
  ]

  const promises = commandsToRun.map(
    command => executor.execute(command)
  )

  try {
    const results = await Promise.all(promises)

    for (const result of results) {
      try {
        const decoded = decodeMode01Response(
          result.normalizedText
        )

        if (decoded) {
          sessionLog.record({
            type: 'decoded-value',
            source: 'manual',
            command: result.command,
            latencyMs: result.latencyMs,
            decoded: {
              kind: 'pid',
              ...decoded
            }
          })
        }
      } catch (error) {
        recordError(error, 'decode', result.command)
      }
    }

    sessionLog.record({
      type: 'activity',
      activity: 'queue-test-completed'
    })
  } catch {
    // Protocol errors are already recorded by the executor.
  }
}

function startTelemetry() {
  if (sessionState.value !== 'ready') {
    recordError(
      new Error('Session is not ready'),
      'poll'
    )

    return
  }

  if (telemetryRunning.value) {
    return
  }

  pollScheduler.clearTasks()

  const tasks = createSupportedTelemetryPollTasks(
    supportedPids.value,
    {
      physicalOnly: transport.kind === 'web-serial-rfcomm'
        || transport.kind === 'android-ble'
    }
  )

  for (const task of tasks) {
    pollScheduler.addTask(task)
  }

  if (tasks.length === 0) {
    recordError(
      new Error('No supported telemetry PIDs'),
      'poll'
    )

    return
  }

  pollScheduler.start()

  telemetryRunning.value = true

  sessionLog.record({
    type: 'telemetry-state',
    state: 'started'
  })
}

function stopTelemetry() {
  if (!telemetryRunning.value) {
    return
  }

  pollScheduler.stop()

  telemetryRunning.value = false

  sessionLog.record({
    type: 'telemetry-state',
    state: 'stopped'
  })
}

async function selectDevice() {
  transportError.value = ''

  try {
    prepareSelectedTransport()
    sessionLog.start({ kind: transport.kind })

    transitionSession('selecting')

    selectedTransport = await transport.select()
    transportState.value = transport.state
    sessionLog.updateTransport(selectedTransport)

    transitionSession('selected')

    sessionLog.record({
      type: 'activity',
      activity: 'adapter-selected'
    })
  } catch (error) {
    transportError.value = toError(error).message
    transportState.value = transport.state
    failSession()

    recordError(error, 'selection')
  }
}

async function connect() {
  transportError.value = ''

  if (sessionState.value !== 'selected') {
    sessionLog.start(selectedTransport)
  }

  try {
    transitionSession('connecting')

    selectedTransport = await transport.connect()
    transportState.value = transport.state
    sessionLog.updateTransport(selectedTransport)

    sessionLog.record({
      type: 'activity',
      activity: 'connected'
    })

    transitionSession('initializing')

    sessionLog.record({
      type: 'activity',
      activity: 'initialization-started'
    })

    await initializeElm327(executor)

    sessionLog.record({
      type: 'activity',
      activity: 'initialization-completed'
    })

    transitionSession('discovering')

    sessionLog.record({
      type: 'activity',
      activity: 'discovery-started'
    })

    const discovery
      = await discoverSupportedPids(executor)

    supportedPids.value = discovery.pids

    for (const range of discovery.ranges) {
      sessionLog.record({
        type: 'capability-discovery',
        command: range.command,
        pids: range.pids,
        rangeStart: range.rangeStart,
        rangeEnd: range.rangeEnd,
        hasNextRange: range.hasNextRange
      })
    }

    sessionLog.record({
      type: 'capability-discovery',
      pids: discovery.pids
    })

    sessionLog.record({
      type: 'activity',
      activity: 'discovery-completed'
    })

    transitionSession('ready')
  } catch (error) {
    transportError.value = toError(error).message
    transportState.value = transport.state
    failSession()

    recordError(error, 'connection')
  }
}

async function disconnect() {
  transportError.value = ''

  try {
    stopTelemetry()

    clearTelemetryState()

    transitionSession('disconnecting')

    await transport.disconnect()
    transportState.value = transport.state

    supportedPids.value = []

    transitionSession('disconnected')

    sessionLog.record({
      type: 'activity',
      activity: 'disconnected'
    })

    sessionLog.finish()
  } catch (error) {
    transportError.value = toError(error).message
    transportState.value = transport.state
    failSession()

    recordError(error, 'disconnect')
  }
}

async function sendCommand() {
  const command = selectedCommand.value

  if (
    transport.kind === 'web-serial-rfcomm'
    && !physicalCommands.includes(command)
  ) {
    recordError(
      new Error('Command is not allowed on the physical transport'),
      'transport-write',
      command
    )

    return
  }

  try {
    const timeoutMs = command === '0198'
      ? 1000
      : 3000

    const result = await executor.execute(
      command,
      timeoutMs
    )

    // Decodificación normal de PIDs Mode 01
    try {
      const decoded = decodeMode01Response(
        result.normalizedText
      )

      if (decoded) {
        telemetryDomainStore.update(
          decoded,
          result
        )

        syncTelemetryState()

        sessionLog.record({
          type: 'decoded-value',
          source: 'manual',
          command: result.command,
          latencyMs: result.latencyMs,
          decoded: {
            kind: 'pid',
            ...decoded
          }
        })
      }
    } catch (error) {
      recordError(error, 'decode', result.command)
    }

    if (
      result.command === '03'
      || result.command === '03TEST'
    ) {
      try {
        const dtcResult = decodeMode03Response(
          result.normalizedText
        )

        sessionLog.record({
          type: 'decoded-value',
          source: 'manual',
          command: result.command,
          latencyMs: result.latencyMs,
          decoded: {
            kind: 'dtc',
            dtcs: dtcResult.dtcs
          }
        })
      } catch (error) {
        recordError(error, 'decode', result.command)
      }
    }

    const supportedPidCommands = [
      '0100',
      '0120',
      '0140',
      '0160',
      '0180',
      '01A0',
      '01C0'
    ]

    if (supportedPidCommands.includes(result.command)) {
      try {
        const supported = decodeSupportedPids(
          result.normalizedText
        )

        sessionLog.record({
          type: 'capability-discovery',
          command: result.command,
          pids: supported.pids,
          rangeStart: supported.rangeStart,
          rangeEnd: supported.rangeEnd,
          hasNextRange: supported.hasNextRange
        })
      } catch (error) {
        recordError(error, 'decode', result.command)
      }
    }
  } catch {
    // Protocol errors are already recorded by the executor.
  }
}

onBeforeUnmount(() => {
  pollScheduler.stop()

  unsubscribePollResult()
  unsubscribePollError()

  executor.dispose()

  if (
    transport.state !== 'idle'
    && transport.state !== 'disconnected'
  ) {
    void transport.disconnect().catch(() => undefined)
  }
})
</script>

<template>
  <main class="pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 sm:pt-6">
    <UContainer class="flex max-w-3xl flex-col gap-4">
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
        :replay-filename="replayFilename"
        :replay-import-error="replayImportError"
        :session-busy="sessionBusy"
        :session-badge-color="sessionBadgeColor"
        @select-device="selectDevice"
        @connect="connect"
        @disconnect="disconnect"
        @import-replay="importReplayFile"
      />

      <DataView
        v-else-if="activeView === 'data'"
        v-model:selected-command="selectedCommand"
        :session-state="sessionState"
        :telemetry-running="telemetryRunning"
        :engine-rpm-metric="engineRpmMetric"
        :vehicle-speed-metric="vehicleSpeedMetric"
        :coolant-temperature-metric="coolantTemperatureMetric"
        :engine-load-metric="engineLoadMetric"
        :throttle-position-metric="throttlePositionMetric"
        :supported-pids="supportedPids"
        :commands="commands"
        :transport-choice="transportChoice"
        @back-to-connection="activeView = 'connection'"
        @start-telemetry="startTelemetry"
        @stop-telemetry="stopTelemetry"
        @send-command="sendCommand"
        @run-queue-test="runQueueTest"
      />

      <LogView
        v-else
        :events="sessionEvents"
        :dropped-events="droppedEvents"
        :truncated="logTruncated"
        @export="downloadSessionLog"
        @clear="clearLog"
      />
    </UContainer>

    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      aria-label="Navegación principal del laboratorio"
    >
      <UContainer class="max-w-md p-2">
        <div class="grid grid-cols-3 gap-2">
          <UButton
            v-for="view in mobileViews"
            :key="view.value"
            :color="activeView === view.value ? 'primary' : 'neutral'"
            :variant="activeView === view.value ? 'soft' : 'ghost'"
            :icon="view.icon"
            size="lg"
            class="min-h-14 flex-col justify-center gap-1 px-2 text-xs"
            :aria-current="activeView === view.value ? 'page' : undefined"
            @click="activeView = view.value"
          >
            {{ view.label }}
          </UButton>
        </div>
      </UContainer>
    </nav>
  </main>
</template>
