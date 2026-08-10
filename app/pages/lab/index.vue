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

async function importReplayFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  replayImportError.value = ''
  replayFilename.value = ''
  replaySessionExport = undefined

  if (!file) {
    return
  }

  try {
    const parsed: unknown = JSON.parse(await file.text())

    buildReplayTranscript(parsed)
    replaySessionExport = parsed
    replayFilename.value = file.name
  } catch (error) {
    replayImportError.value = toError(error).message
    input.value = ''
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
    supportedPids.value
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

      <section
        v-if="activeView === 'connection'"
        class="flex flex-col gap-4"
        aria-labelledby="connection-view-title"
      >
        <div class="flex flex-col gap-1 px-1">
          <p class="text-sm font-medium text-primary">
            Primer paso
          </p>
          <h1
            id="connection-view-title"
            class="text-2xl font-bold tracking-tight text-highlighted"
          >
            Preparar conexión
          </h1>
          <p class="text-sm leading-5 text-muted">
            Identifica el VEEPEAK con seguridad antes de activar cualquier
            transporte OBD.
          </p>
        </div>

        <GattInspectorPanel />

        <details class="group rounded-xl border border-default bg-default">
          <summary class="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
              <UIcon
                name="i-lucide-toolbox"
                class="size-5"
                aria-hidden="true"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-semibold text-highlighted">
                Herramientas OBD avanzadas
              </span>
              <span class="block text-sm text-muted">
                Mock, Replay y Web Serial para desarrollo
              </span>
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>

          <div class="flex flex-col gap-5 border-t border-default p-4">
            <div class="flex flex-col gap-2">
              <label
                for="transport-choice"
                class="text-sm font-medium text-highlighted"
              >
                Fuente de datos OBD
              </label>
              <select
                id="transport-choice"
                v-model="transportChoice"
                class="min-h-12 w-full rounded-lg border border-default bg-default px-4 text-base text-highlighted outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
                :disabled="sessionState !== 'idle' && sessionState !== 'disconnected' && sessionState !== 'error'"
              >
                <option value="mock">
                  Mock · datos sintéticos
                </option>
                <option value="replay">
                  Replay · sesión grabada
                </option>
                <option value="web-serial-rfcomm">
                  Real · Web Serial / RFCOMM
                </option>
              </select>
              <p class="text-sm text-muted">
                <template v-if="transportChoice === 'mock'">
                  Verifica la aplicación sin adaptador físico.
                </template>
                <template v-else-if="transportChoice === 'replay'">
                  Reproduce localmente una sesión estructurada.
                </template>
                <template v-else>
                  Requiere una plataforma con Web Serial y RFCOMM.
                </template>
              </p>
            </div>

            <div
              v-if="transportChoice === 'replay'"
              class="flex flex-col gap-2 rounded-xl border border-default bg-elevated p-4"
            >
              <label
                for="replay-file"
                class="text-sm font-medium"
              >
                Archivo de sesión JSON
              </label>
              <input
                id="replay-file"
                type="file"
                accept="application/json,.json"
                class="min-h-12 w-full text-sm text-muted file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:text-primary"
                @change="importReplayFile"
              >
              <p
                v-if="replayFilename"
                class="text-sm text-success"
                role="status"
              >
                Sesión cargada: {{ replayFilename }}
              </p>
              <p
                v-if="replayImportError"
                class="text-sm text-error"
                role="alert"
              >
                {{ replayImportError }}
              </p>
            </div>

            <div class="flex items-center justify-between gap-3 rounded-xl border border-default bg-elevated p-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">
                  Estado OBD
                </p>
                <p class="text-sm text-muted">
                  {{ sessionStateLabel }} · {{ transportState }}
                </p>
              </div>
              <UBadge
                :color="sessionBadgeColor"
                variant="solid"
              >
                {{ sessionStateLabel }}
              </UBadge>
            </div>

            <UAlert
              v-if="transportError"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              title="No se pudo completar la operación"
              :description="transportError"
            />

            <UButton
              v-if="sessionState === 'idle' || sessionState === 'disconnected' || sessionState === 'error'"
              color="primary"
              size="xl"
              block
              icon="i-lucide-mouse-pointer-click"
              class="min-h-12 justify-center"
              @click="selectDevice"
            >
              Seleccionar adaptador
            </UButton>
            <UButton
              v-else-if="sessionState === 'selected'"
              color="primary"
              size="xl"
              block
              icon="i-lucide-plug"
              class="min-h-12 justify-center"
              @click="connect"
            >
              Conectar e inicializar
            </UButton>
            <UButton
              v-else-if="sessionBusy"
              color="neutral"
              variant="soft"
              size="xl"
              block
              loading
              disabled
              class="min-h-12 justify-center"
            >
              {{ sessionStateLabel }}
            </UButton>
            <UButton
              v-else
              color="error"
              variant="soft"
              size="xl"
              block
              icon="i-lucide-unplug"
              class="min-h-12 justify-center"
              @click="disconnect"
            >
              Desconectar
            </UButton>
          </div>
        </details>
      </section>

      <section
        v-else-if="activeView === 'data'"
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
              @click="activeView = 'connection'"
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
                @click="startTelemetry"
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
                @click="stopTelemetry"
              >
                Detener telemetría
              </UButton>
            </div>
          </UCard>

          <div class="grid grid-cols-2 gap-3">
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
                    v-model="selectedCommand"
                    :items="commands"
                    size="lg"
                    class="w-full"
                  />
                </div>
                <UButton
                  color="primary"
                  size="lg"
                  icon="i-lucide-send"
                  class="min-h-12 justify-center"
                  @click="sendCommand"
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
                  @click="runQueueTest"
                >
                  Probar cola
                </UButton>
              </div>
            </div>
          </details>
        </template>
      </section>

      <SessionLogPanel
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
