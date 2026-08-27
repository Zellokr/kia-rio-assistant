<script setup lang="ts">
import { onBeforeUnmount, ref, computed } from 'vue'
import { MockObdTransport } from '~~/core/obd/transport/MockObdTransport'
import {
  AndroidBleObdTransport
} from '~~/core/obd/transport/AndroidBleObdTransport'
import { capacitorAndroidBle } from '~/services/capacitorAndroidBle'
import { VEEPEAK_BLE_PROFILE } from '~/services/veepeakBleProfile'
import { ElmCommandExecutor } from '~~/core/obd/protocol/ElmCommandExecutor'
import { decodeMode01Response } from '~~/core/obd/decoder/decodeMode01Response'
import { decodeSupportedPids } from '~~/core/obd/decoder/decodeSupportedPids'
import { initializeElm327 } from '~~/core/obd/protocol/Elm327Initializer'
import { resolveSupportedPids } from '~~/core/obd/capability/resolveSupportedPids'
import {
  ObdSessionStateMachine
} from '~~/core/obd/session/ObdSessionStateMachine'
import {
  ObdPollScheduler
} from '~~/core/obd/polling/ObdPollScheduler'
import {
  DTC_MODES,
  decodeDtcResponse
} from '~~/core/obd/decoder/decodeDtcResponse'
import {
  ObdTelemetryStore
} from '~~/core/obd/telemetry/ObdTelemetryStore'
import {
  createSupportedTelemetryPollTasks
} from '~~/core/obd/telemetry/createSupportedTelemetryPollTasks'
import {
  ObdSessionLog
} from '~~/core/obd/logging/ObdSessionLog'
import { BufferedObdSessionRecorder } from '~~/core/obd/persistence/BufferedObdSessionRecorder'
import type { ObdPersistence } from '~~/data/repositories/createObdPersistence'
import {
  PHYSICAL_ALLOWED_COMMANDS
} from '~~/core/obd/policy/PhysicalObdCommandPolicy'
import type {
  ObdActivityEvent,
  ObdErrorPhase
} from '~~/core/obd/logging/ObdSessionLog'
import {
  isObdTransportUnavailable,
  isPhysicalTransportKind
} from '~~/core/obd/transport/ObdTransport'
import type {
  ObdTransport,
  ObdTransportMetadata,
  ObdTransportState
} from '~~/core/obd/transport/ObdTransport'
import {
  useVehicleDiagnostics
} from '~/composables/useVehicleDiagnostics'
import type { DtcModeKey } from '~/composables/useVehicleDiagnostics'
import {
  kiaRioWarningLightsCatalog
} from '~~/catalog/kia-rio/warning-lights'
import { labViews } from '~/utils/labNav'
import type { LabViewId } from '~/utils/labNav'
import { useObdSessionLog } from '~/composables/useObdSessionLog'
import { useObdTelemetry } from '~/composables/useObdTelemetry'
import { useObdReconnection } from '~/composables/useObdReconnection'
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

// A dropped adapter makes every poll reject; halt telemetry after this many
// consecutive failures instead of flooding the log until the user reacts.
const MAX_CONSECUTIVE_POLL_ERRORS = 5

let transport: ObdTransport = new MockObdTransport()
const sessionLog = new ObdSessionLog({
  transport: { kind: transport.kind }
})
let executor = new ElmCommandExecutor(
  transport,
  event => sessionLog.record(event)
)
const session = new ObdSessionStateMachine()
let pollScheduler = new ObdPollScheduler(
  executor,
  { maxConsecutiveErrors: MAX_CONSECUTIVE_POLL_ERRORS }
)
const supportedPids = ref<string[]>([])
const telemetryRunning = ref(false)
const sessionState = ref(session.state)
const transportState = ref(transport.state)
const activeView = ref<'connection' | 'data' | 'log'>('connection')
const transportChoice = ref<
  'mock' | 'replay' | 'android-ble'
>('android-ble')
const transportError = ref('')
const telemetryDomainStore
  = new ObdTelemetryStore()
let selectedTransport: ObdTransportMetadata = {
  kind: transport.kind
}
const persistence = import.meta.client
  ? (useNuxtApp() as { $obdPersistence?: ObdPersistence }).$obdPersistence
  : undefined
let recorder: BufferedObdSessionRecorder | undefined
let reconnectCount = 0

const {
  events: sessionEvents,
  droppedEvents,
  truncated: logTruncated,
  clearDisplay: clearLog,
  downloadJson: downloadSessionLog,
  copyJson: copySessionLog
} = useObdSessionLog(sessionLog)

const logCopyStatus = ref('')

async function copyLog(): Promise<void> {
  const copied = await copySessionLog()

  logCopyStatus.value = copied
    ? 'Registro copiado al portapapeles'
    : 'No se pudo copiar. Concede acceso al portapapeles e inténtalo de nuevo.'
}

function setActiveView(view: LabViewId): void {
  activeView.value = view
}

const sessionStateLabel = computed(() => {
  const labels: Record<string, string> = {
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

function recordPersistenceError(error: unknown): void {
  console.warn('OBD persistence failed without affecting the active session', error)
}

/**
 * Driver-facing diagnostic reads.
 *
 * Separate from the manual command box on purpose. That box is a raw
 * protocol tool and stays one: it sends what is typed and shows what came
 * back. This path goes through `readDiagnosticCodes`, so a vehicle that
 * answers nothing is reported as unconfirmed instead of as a failure.
 *
 * The executor is passed as a getter because `connect` replaces it when
 * the transport changes; capturing it here would read through a disposed
 * object after the first reconnection.
 */
const diagnostics = useVehicleDiagnostics({
  executor: () => executor,
  adapterConnected: () => sessionState.value === 'ready'
})

async function readDiagnosticTroubleCodes(
  mode: DtcModeKey
): Promise<void> {
  const previous = diagnostics.reads.value.find(
    read => read.state === mode
  )
  const startedAt = Date.now()

  await diagnostics.read(mode)

  const outcome = diagnostics.reads.value.find(
    read => read.state === mode
  )

  // `read` is a no-op while another read is in flight, which would leave
  // the previous outcome in place. Logging and persisting it again would
  // duplicate an observation the vehicle only reported once.
  if (outcome === undefined || outcome === previous) {
    return
  }

  if (outcome.kind !== 'codes') {
    return
  }

  const observedAt = new Date().toISOString()
  const observations = outcome.codes.map(code => ({
    ...code,
    state: outcome.state,
    observedAt
  }))

  sessionLog.record({
    type: 'decoded-value',
    source: 'manual',
    command: DTC_MODES[mode].command,
    latencyMs: Date.now() - startedAt,
    decoded: {
      kind: 'dtc',
      observations
    }
  })

  if (!persistence) {
    return
  }

  const sessionId = sessionLog.getExport().sessionId

  persist(persistence.recordObservations(
    observations.map((observation, index) => ({
      schemaVersion: 2 as const,
      id: `${sessionId}:${observation.code}:${Date.now()}:${index}`,
      sessionId,
      code: observation.code,
      type: observation.type,
      state: observation.state,
      observedAt: observation.observedAt
    }))
  ))
}

function persist(operation: Promise<void>): void {
  void operation.catch(recordPersistenceError)
}

function persistedSession() {
  const exported = sessionLog.getExport()
  return {
    schemaVersion: 1 as const,
    sessionId: exported.sessionId,
    startedAt: exported.startedAt,
    endedAt: exported.endedAt,
    transport: exported.transport,
    reconnectCount,
    truncated: false
  }
}

sessionLog.subscribe((change) => {
  if (!persistence) return
  if (change.type === 'started') {
    recorder?.finish()
    reconnectCount = 0
    recorder = new BufferedObdSessionRecorder(change.session.sessionId, persistence, {
      onError: recordPersistenceError
    })
    persist(persistence.startSession(persistedSession()))
  } else if (change.type === 'event-recorded') {
    recorder?.record(change.event)
    if (change.event.type === 'activity' && change.event.activity === 'reconnected') {
      reconnectCount++
      persist(persistence.updateSession(persistedSession()))
    }
  } else if (change.type === 'finished') {
    recorder?.finish()
    persist(persistence.updateSession(persistedSession()))
  }
})

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
let unsubscribePollHalt = () => {}
let unsubscribeTransportState = () => {}

/**
 * Reacts to an unexpected transport drop (e.g. a lost Bluetooth link) while
 * the session sits connected. Our own disconnect() has already left 'ready'
 * before it stops the transport, and connect()/select() failures are handled
 * by their awaited catch, so gating on 'ready' targets only the uncovered
 * case: the link dies while idle-connected or mid-telemetry.
 */
function handleTransportStateChange(state: ObdTransportState): void {
  transportState.value = transport.state

  if (
    !isObdTransportUnavailable(state)
    || sessionState.value !== 'ready'
  ) {
    return
  }

  recordError(
    new Error('Transport link lost unexpectedly'),
    'disconnect'
  )

  reconnection.notifyLinkSuspect('transport-state')
}

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

  unsubscribePollHalt = pollScheduler.onHalt(({ task }) => {
    // The scheduler already stopped itself; reflect the lost link in the UI
    // and seal the telemetry run so it does not look like it is still polling.
    telemetryRunning.value = false

    recordError(
      new Error('Telemetry stopped after repeated poll failures'),
      'poll',
      task.command
    )

    sessionLog.record({
      type: 'telemetry-state',
      state: 'stopped'
    })

    reconnection.notifyLinkSuspect('poll-halt')
  })

  unsubscribeTransportState = transport.subscribeState(
    handleTransportStateChange
  )
}

attachPollObservers()

function replaceTransport(next: ObdTransport): void {
  pollScheduler.stop()
  unsubscribePollResult()
  unsubscribePollError()
  unsubscribePollHalt()
  unsubscribeTransportState()
  executor.dispose()

  transport = next
  executor = new ElmCommandExecutor(
    transport,
    event => sessionLog.record(event)
  )
  pollScheduler = new ObdPollScheduler(
    executor,
    { maxConsecutiveErrors: MAX_CONSECUTIVE_POLL_ERRORS }
  )
  attachPollObservers()
  transportState.value = transport.state
}

function prepareSelectedTransport(): void {
  if (transportChoice.value === 'android-ble') {
    if (transport.kind !== 'android-ble') {
      replaceTransport(new AndroidBleObdTransport({
        bridge: capacitorAndroidBle,
        profile: VEEPEAK_BLE_PROFILE
      }))
    }

    return
  }

  throw new Error(
    'Transporte no disponible en la aplicación'
  )
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

function recordActivity(
  activity: ObdActivityEvent['activity']
): void {
  sessionLog.record({ type: 'activity', activity })
}

// The composable never receives replaceTransport: it has no way to swap the
// live transport, so "reconnection never replaces the transport" holds by
// construction rather than by assertion. transport/executor/pollScheduler
// are read late through these accessors because replaceTransport reassigns
// all three; capturing them here would silently reconnect a stale transport.
const reconnection = useObdReconnection({
  sessionState,
  transitionSession,
  failSession,
  recordActivity,
  recordError,
  getTransport: () => transport,
  getExecutor: () => executor,
  getPollScheduler: () => pollScheduler,
  getSupportedPids: () => supportedPids.value,
  onTelemetryStopped: () => {
    telemetryRunning.value = false
  },
  onTransportConnected: (metadata) => {
    selectedTransport = metadata
    transportState.value = transport.state
    sessionLog.updateTransport(metadata)
  },
  onSupportedPidsResolved: (pids) => {
    supportedPids.value = pids
  }
})

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
  isPhysicalTransportKind(transportChoice.value)
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
      physicalOnly: isPhysicalTransportKind(transport.kind)
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

    const discovery = await resolveSupportedPids(executor, selectedTransport, {
      cache: persistence,
      onCacheError: recordPersistenceError
    })

    supportedPids.value = discovery.pids

    if (discovery.decodeError) {
      recordError(
        new Error(
          `Supported PID discovery stopped: ${discovery.decodeError.message}`
        ),
        'decode',
        discovery.decodeError.command
      )
    }

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
    isPhysicalTransportKind(transport.kind)
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
        const dtcResult = decodeDtcResponse(
          result.normalizedText,
          DTC_MODES.stored
        )
        const observedAt = new Date().toISOString()
        const observations = dtcResult.codes.map(code => ({
          ...code,
          state: dtcResult.state,
          observedAt
        }))

        sessionLog.record({
          type: 'decoded-value',
          source: 'manual',
          command: result.command,
          latencyMs: result.latencyMs,
          decoded: {
            kind: 'dtc',
            observations
          }
        })
        if (persistence) {
          const sessionId = sessionLog.getExport().sessionId
          persist(persistence.recordObservations(observations.map((code, index) => ({
            schemaVersion: 2 as const,
            id: `${sessionId}:${code.code}:${Date.now()}:${index}`,
            sessionId,
            code: code.code,
            type: code.type,
            state: dtcResult.state,
            observedAt: code.observedAt
          }))))
        }
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
  reconnection.dispose()
  pollScheduler.stop()

  unsubscribePollResult()
  unsubscribePollError()
  unsubscribePollHalt()
  unsubscribeTransportState()

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
