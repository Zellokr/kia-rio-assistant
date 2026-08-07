<script setup lang="ts">
import { onBeforeUnmount, ref, computed } from 'vue'
import { ElmPromptParser } from '~~/core/obd/parser/ElmPromptParser'
import { MockObdTransport } from '~~/core/obd/transport/MockObdTransport'
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

const transport = new MockObdTransport()
const executor = new ElmCommandExecutor(transport)
const session = new ObdSessionStateMachine()
const pollScheduler = new ObdPollScheduler(executor)
const supportedPids = ref<string[]>([])
const telemetryRunning = ref(false)
const sessionState = ref(session.state)

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

const unsubscribePollResult
  = pollScheduler.onResult(({ result }) => {
    try {
      const decoded = decodeMode01Response(
        result.normalizedText
      )

      if (decoded) {
        log.value.push(
          `TELEMETRY ← ${decoded.label}: ${decoded.value} ${decoded.unit}`
        )
      }
    } catch (error) {
      log.value.push(
        `TELEMETRY DECODE ERROR: ${String(error)}`
      )
    }
  })

const unsubscribePollError
  = pollScheduler.onError(({ task, error }) => {
    log.value.push(
      `TELEMETRY ERROR ← ${task.command}: ${error.message}`
    )
  })

const transportBadgeColor = computed(() => {
  switch (String(transport.state)) {
    case 'idle': return 'neutral'
    case 'selecting': return 'warning'
    case 'selected': return 'primary'
    case 'connecting': return 'warning'
    case 'connected': return 'success'
    case 'disconnecting': return 'warning'
    case 'disconnected': return 'neutral'
    case 'error': return 'error'
    default: return 'neutral'
  }
})
const log = ref<string[]>([])
const parser = new ElmPromptParser()

function transitionSession(
  next: Parameters<typeof session.transition>[0]
) {
  session.transition(next)
  sessionState.value = session.state
}

function failSession() {
  session.fail()
  sessionState.value = session.state
}

const commands = [
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
  '03'
]

const selectedCommand = ref('ATZ')

const unsubscribe = transport.subscribe((data) => {
  const chunkText = new TextDecoder().decode(data)

  log.value.push(
    `RX CHUNK ← ${JSON.stringify(chunkText)}`
  )

  try {
    const responses = parser.push(data)

    for (const response of responses) {
      log.value.push(
        `RX FRAME ← ${response.normalizedText}`
      )
    }
  } catch (error) {
    log.value.push(
      `PARSER ERROR: ${String(error)}`
    )
  }
})

async function runQueueTest() {
  log.value.push('--- QUEUE TEST START ---')

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
      log.value.push(
        `QUEUE RESULT ← ${result.command}: ${result.normalizedText}`
      )
      try {
        const decoded = decodeMode01Response(
          result.normalizedText
        )

        if (decoded) {
          log.value.push(
            `VALUE ← ${decoded.label}: ${decoded.value} ${decoded.unit}`
          )
        }
      } catch (error) {
        log.value.push(
          `DECODE ERROR: ${String(error)}`
        )
      }
    }

    log.value.push('--- QUEUE TEST END ---')
  } catch (error) {
    log.value.push(
      `QUEUE ERROR: ${String(error)}`
    )
  }
}

function startTelemetry() {
  if (sessionState.value !== 'ready') {
    log.value.push(
      'TELEMETRY ERROR: session is not ready'
    )

    return
  }

  if (telemetryRunning.value) {
    return
  }

  pollScheduler.clearTasks()

  let taskCount = 0

  if (supportedPids.value.includes('0C')) {
    pollScheduler.addTask({
      id: 'engine-rpm',
      command: '010C',
      intervalMs: 1000
    })

    taskCount++
  }

  if (supportedPids.value.includes('05')) {
    pollScheduler.addTask({
      id: 'coolant-temperature',
      command: '0105',
      intervalMs: 3000
    })

    taskCount++
  }

  if (taskCount === 0) {
    log.value.push(
      'TELEMETRY ERROR: no supported telemetry PIDs'
    )

    return
  }

  pollScheduler.start()

  telemetryRunning.value = true

  log.value.push(
    '--- TELEMETRY START ---'
  )
}

function stopTelemetry() {
  if (!telemetryRunning.value) {
    return
  }

  pollScheduler.stop()

  telemetryRunning.value = false

  log.value.push(
    '--- TELEMETRY STOP ---'
  )
}

async function selectDevice() {
  try {
    transitionSession('selecting')

    await transport.select()

    transitionSession('selected')

    log.value.push(
      'Dispositivo seleccionado'
    )
  } catch (error) {
    failSession()

    log.value.push(
      `SELECTION ERROR: ${String(error)}`
    )
  }
}

async function connect() {
  try {
    transitionSession('connecting')

    await transport.connect()

    log.value.push('Conectado')

    transitionSession('initializing')

    log.value.push(
      '--- ELM327 INITIALIZATION START ---'
    )

    const initialization
      = await initializeElm327(executor)

    for (const result of initialization.commands) {
      log.value.push(
        `INIT ← ${result.command}: ${result.normalizedText} (${result.latencyMs} ms)`
      )
    }

    log.value.push(
      '--- ELM327 READY ---'
    )

    transitionSession('discovering')

    log.value.push(
      '--- PID DISCOVERY START ---'
    )

    const discovery
      = await discoverSupportedPids(executor)

    supportedPids.value = discovery.pids

    for (const range of discovery.ranges) {
      log.value.push(
        `DISCOVERY ← ${range.command}: ${range.response.normalizedText}`
      )

      log.value.push(
        `RANGE ${range.rangeStart
          .toString(16)
          .toUpperCase()
          .padStart(2, '0')}-${range.rangeEnd
          .toString(16)
          .toUpperCase()
          .padStart(2, '0')} ← ${range.pids.join(', ')}`
      )
    }

    log.value.push(
      `SUPPORTED PIDS ALL ← ${discovery.pids.join(', ')}`
    )

    log.value.push(
      '--- PID DISCOVERY END ---'
    )

    transitionSession('ready')

    log.value.push(
      'SESSION READY'
    )
  } catch (error) {
    failSession()

    log.value.push(
      `CONNECTION ERROR: ${String(error)}`
    )
  }
}

async function disconnect() {
  try {
    pollScheduler.stop()
    telemetryRunning.value = false

    transitionSession('disconnecting')

    await transport.disconnect()

    supportedPids.value = []

    transitionSession('disconnected')

    log.value.push('Desconectado')
  } catch (error) {
    failSession()

    log.value.push(
      `DISCONNECT ERROR: ${String(error)}`
    )
  }
}

async function sendCommand() {
  const command = selectedCommand.value

  log.value.push(`QUEUE → ${command}`)

  try {
    const result = await executor.execute(command)

    log.value.push(
      `DONE ← ${result.command}: ${result.normalizedText} (${result.latencyMs} ms)`
    )

    // Decodificación normal de PIDs Mode 01
    try {
      const decoded = decodeMode01Response(
        result.normalizedText
      )

      if (decoded) {
        log.value.push(
          `VALUE ← ${decoded.label}: ${decoded.value} ${decoded.unit}`
        )
      }
    } catch (error) {
      log.value.push(
        `DECODE ERROR: ${String(error)}`
      )
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

        log.value.push(
          `SUPPORTED PIDS ← ${supported.pids.join(', ')}`
        )

        log.value.push(
          `NEXT RANGE ← ${supported.hasNextRange ? 'sí' : 'no'}`
        )
      } catch (error) {
        log.value.push(
          `PID DISCOVERY ERROR: ${String(error)}`
        )
      }
    }
  } catch (error) {
    log.value.push(
      `ERROR: ${String(error)}`
    )
  }
}

function clearLog() {
  log.value = []
}

onBeforeUnmount(() => {
  pollScheduler.stop()

  unsubscribePollResult()
  unsubscribePollError()

  executor.dispose()
  unsubscribe()
})
</script>

<template>
  <main class="px-4 sm:px-6 lg:px-8 py-6">
    <UContainer>
      <h1 class="text-2xl font-semibold mb-4">
        OBD-II Lab
      </h1>

      <UCard class="p-4 mb-4">
        <div class="grid gap-4 md:grid-cols-2 items-start">
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                color="success"
                variant="soft"
                size="md"
                :disabled="sessionState !== 'ready' || telemetryRunning"
                @click="startTelemetry"
              >
                Iniciar telemetría
              </UButton>

              <UButton
                color="neutral"
                variant="soft"
                size="md"
                :disabled="!telemetryRunning"
                @click="stopTelemetry"
              >
                Detener telemetría
              </UButton>

              <UButton
                color="neutral"
                variant="outline"
                size="md"
                @click="selectDevice"
              >
                Seleccionar adaptador
              </UButton>

              <UButton
                color="primary"
                size="md"
                @click="connect"
              >
                Conectar
              </UButton>

              <UButton
                color="warning"
                variant="soft"
                size="md"
                @click="runQueueTest"
              >
                Probar cola
              </UButton>

              <UButton
                color="error"
                variant="soft"
                size="md"
                @click="disconnect"
              >
                Desconectar
              </UButton>
            </div>

            <div class="flex items-center gap-3 flex-wrap">
              <div class="text-sm text-muted">
                PIDs soportados:
              </div>
              <div class="flex gap-2 flex-wrap">
                <template v-if="supportedPids.length">
                  <UBadge
                    v-for="pid in supportedPids"
                    :key="pid"
                    color="neutral"
                    variant="outline"
                    size="xs"
                  >
                    {{ pid }}
                  </UBadge>
                </template>
                <template v-else>
                  <div class="text-sm text-muted">
                    — ninguno —
                  </div>
                </template>
              </div>
            </div>
          </div>

          <div class="flex flex-col items-start md:items-end gap-3">
            <div class="text-sm text-muted">
              Estado
            </div>

            <div class="flex items-center gap-3">
              <div class="text-sm text-muted text-right">
                Sesión
              </div>
              <UBadge
                :color="sessionBadgeColor"
                size="sm"
                variant="solid"
              >
                {{ sessionState }}
              </UBadge>
            </div>

            <div class="flex items-center gap-3">
              <div class="text-sm text-muted text-right">
                Transporte
              </div>
              <UBadge
                :color="transportBadgeColor"
                size="sm"
                variant="solid"
              >
                {{ transport.state }}
              </UBadge>
            </div>

            <div class="flex items-center gap-3">
              <div class="text-sm text-muted text-right">
                Telemetría
              </div>
              <UBadge
                :color="telemetryRunning ? 'success' : 'neutral'"
                size="sm"
                variant="solid"
              >
                {{ telemetryRunning ? 'running' : 'stopped' }}
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>

      <UCard class="p-4 mb-4">
        <div class="flex items-center gap-4">
          <USelect
            v-model="selectedCommand"
            :items="commands"
            class="w-48"
          />

          <UButton
            color="primary"
            size="md"
            variant="subtle"
            @click="sendCommand"
          >
            Enviar
          </UButton>
        </div>
      </UCard>

      <UCard class="p-4 mb-4">
        <div class="flex justify-between items-center mb-2">
          <div class="text-sm text-muted">
            Logs
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            @click="clearLog"
          >
            Limpiar
          </UButton>
        </div>

        <pre class="min-h-[300px] p-4 bg-elevated text-default rounded overflow-auto">{{ log.join('\n') }}</pre>
      </UCard>
    </UContainer>
  </main>
</template>

<style scoped>
.text-muted { color: rgba(107,114,128,1); }
.bg-elevated { background-color: #0b1220; }
.text-default { color: #e6eef8; }
.bg-primary { background-color: #2563eb; }
</style>
