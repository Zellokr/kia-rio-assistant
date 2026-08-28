import {
  computed,
  getCurrentInstance,
  inject,
  onScopeDispose,
  ref,
  shallowRef
} from 'vue'

import {
  resolveSupportedPids
} from '~~/core/obd/capability/resolveSupportedPids'
import {
  DTC_MODES,
  decodeDtcResponse
} from '~~/core/obd/decoder/decodeDtcResponse'
import {
  decodeMode01Response
} from '~~/core/obd/decoder/decodeMode01Response'
import {
  decodeSupportedPids
} from '~~/core/obd/decoder/decodeSupportedPids'
import type { DtcObservation } from '~~/core/obd/dtc/DtcCode'
import { ObdSessionLog } from '~~/core/obd/logging/ObdSessionLog'
import type {
  ObdActivityEvent,
  ObdErrorPhase
} from '~~/core/obd/logging/ObdSessionLog'
import {
  BufferedObdSessionRecorder
} from '~~/core/obd/persistence/BufferedObdSessionRecorder'
import {
  PHYSICAL_ALLOWED_COMMANDS
} from '~~/core/obd/policy/PhysicalObdCommandPolicy'
import { ObdPollScheduler } from '~~/core/obd/polling/ObdPollScheduler'
import {
  ElmCommandExecutor
} from '~~/core/obd/protocol/ElmCommandExecutor'
import type {
  ElmCommandResult
} from '~~/core/obd/protocol/ElmCommandExecutor'
import { initializeElm327 } from '~~/core/obd/protocol/Elm327Initializer'
import {
  ObdSessionStateMachine
} from '~~/core/obd/session/ObdSessionStateMachine'
import type {
  ObdSessionState
} from '~~/core/obd/session/ObdSessionStateMachine'
import {
  createSupportedTelemetryPollTasks
} from '~~/core/obd/telemetry/createSupportedTelemetryPollTasks'
import { ObdTelemetryStore } from '~~/core/obd/telemetry/ObdTelemetryStore'
import {
  isObdTransportUnavailable,
  isPhysicalTransportKind
} from '~~/core/obd/transport/ObdTransport'
import type {
  ObdTransport,
  ObdTransportMetadata,
  ObdTransportState
} from '~~/core/obd/transport/ObdTransport'
import type { ObdPersistence } from '~~/data/repositories/createObdPersistence'
import { useObdReconnection } from '~/composables/useObdReconnection'
import { useObdSessionLog } from '~/composables/useObdSessionLog'
import { useObdTelemetry } from '~/composables/useObdTelemetry'
import { useVehicleDiagnostics } from '~/composables/useVehicleDiagnostics'
import type { DtcModeKey } from '~/composables/useVehicleDiagnostics'
import {
  createLabTransport,
  labTransportFactoryKey
} from '~/utils/labTransportFactory'
import type { LabTransportFactory } from '~/utils/labTransportFactory'
import type { ObdTransportChoice } from '~/utils/obdTransportChoice'

// A dropped adapter makes every poll reject; halt telemetry after this many
// consecutive failures instead of flooding the log until the user reacts.
const MAX_CONSECUTIVE_POLL_ERRORS = 5

/**
 * `0198` is the adapter's own status word rather than a vehicle read, so it
 * answers immediately or not at all; the rest are vehicle round trips.
 */
const ADAPTER_STATUS_COMMAND = '0198'
const ADAPTER_STATUS_TIMEOUT_MS = 1000
const DEFAULT_COMMAND_TIMEOUT_MS = 3000

const SIMULATED_COMMANDS = [
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

const PHYSICAL_COMMANDS: string[] = [...PHYSICAL_ALLOWED_COMMANDS]

/** The Mode 01 commands that answer with a supported-PID bitmask. */
const SUPPORTED_PID_COMMANDS = [
  '0100',
  '0120',
  '0140',
  '0160',
  '0180',
  '01A0',
  '01C0'
]

/** The manual commands whose answer carries stored trouble codes. */
const STORED_DTC_COMMANDS = ['03', '03TEST']

const QUEUE_TEST_COMMANDS = ['010C', '0105', '03']

/**
 * Everything the lab page needs to drive one OBD-II session.
 *
 * This used to live inline in `pages/lab/index.vue`, which made the route
 * the owner of the transport, the executor, the poll scheduler, the session
 * log, persistence and their teardown — roughly a thousand lines in which
 * the only part that belonged to a page was the template. Pulling it here
 * makes the page a view again, and it makes the session reachable without
 * mounting a component.
 *
 * The pieces the session owns are held in `shallowRef` rather than plain
 * bindings because `replaceTransport` swaps all three at once when the
 * adapter changes: reading them late through `.value` is what keeps a
 * reconnection from driving a disposed executor.
 *
 * `createTransport` may be passed directly so the session can be driven
 * inside a bare `effectScope`, with no component anywhere. Without it the
 * factory can only arrive through `inject`, which needs a mounted component
 * — and a session that can only be reached by mounting a page is the thing
 * this extraction exists to end. A component still gets the injected
 * factory, so the page and the Android build are unchanged.
 */
export interface ObdLabSessionOptions {
  readonly createTransport?: LabTransportFactory
}

export function useObdLabSession(options: ObdLabSessionOptions = {}) {
  const createTransport = options.createTransport
    ?? (getCurrentInstance()
      ? inject(labTransportFactoryKey, createLabTransport)
      : createLabTransport)

  const transport = shallowRef<ObdTransport>(createTransport('android-ble'))
  const sessionLog = new ObdSessionLog({
    transport: { kind: transport.value.kind }
  })
  const executor = shallowRef(
    new ElmCommandExecutor(
      transport.value,
      event => sessionLog.record(event)
    )
  )
  const session = new ObdSessionStateMachine()
  const pollScheduler = shallowRef(
    new ObdPollScheduler(
      executor.value,
      { maxConsecutiveErrors: MAX_CONSECUTIVE_POLL_ERRORS }
    )
  )

  const supportedPids = ref<string[]>([])
  const telemetryRunning = ref(false)
  const sessionState = ref<ObdSessionState>(session.state)
  const transportState = ref<ObdTransportState>(transport.value.state)
  const transportChoice = ref<ObdTransportChoice>('android-ble')
  const transportError = ref('')
  const selectedCommand = ref('ATZ')

  const telemetryDomainStore = new ObdTelemetryStore()

  let selectedTransport: ObdTransportMetadata = {
    kind: transport.value.kind
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

  const {
    engineRpm: engineRpmMetric,
    coolantTemperature: coolantTemperatureMetric,
    engineLoad: engineLoadMetric,
    vehicleSpeed: vehicleSpeedMetric,
    throttlePosition: throttlePositionMetric,
    setSnapshot: setTelemetrySnapshot,
    clear: clearReactiveTelemetry
  } = useObdTelemetry()

  const commands = computed(() => (
    isPhysicalTransportKind(transportChoice.value)
      ? PHYSICAL_COMMANDS
      : SIMULATED_COMMANDS
  ))

  const sessionBusy = computed(() => {
    return [
      'selecting',
      'connecting',
      'initializing',
      'discovering',
      'disconnecting'
    ].includes(sessionState.value)
  })

  /**
   * The transport reports its own transitions through `subscribeState`, but
   * `select`, `connect` and `disconnect` also read it back once they return
   * so the view never lags a resolved promise. One helper instead of nine
   * copies of the same assignment.
   */
  function syncTransportState(): void {
    transportState.value = transport.value.state
  }

  function syncTelemetryState(): void {
    setTelemetrySnapshot(telemetryDomainStore.getSnapshot())
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

  /**
   * Persistence is a recording of the session, never a participant in it: a
   * failed write must not interrupt a driver mid-read.
   */
  function recordPersistenceError(error: unknown): void {
    console.warn('OBD persistence failed without affecting the active session', error)
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

  const unsubscribeSessionLog = sessionLog.subscribe((change) => {
    if (!persistence) return

    if (change.type === 'started') {
      recorder?.finish()
      reconnectCount = 0
      recorder = new BufferedObdSessionRecorder(
        change.session.sessionId,
        persistence,
        { onError: recordPersistenceError }
      )
      persist(persistence.startSession(persistedSession()))
    } else if (change.type === 'event-recorded') {
      recorder?.record(change.event)

      if (
        change.event.type === 'activity'
        && change.event.activity === 'reconnected'
      ) {
        reconnectCount++
        persist(persistence.updateSession(persistedSession()))
      }
    } else if (change.type === 'finished') {
      recorder?.finish()
      persist(persistence.updateSession(persistedSession()))
    }
  })

  /**
   * Persists trouble codes the vehicle reported once.
   *
   * Shared by the driver-facing read and the manual `03` command so the two
   * paths cannot drift into writing different rows for the same observation.
   */
  function persistObservations(
    observations: readonly DtcObservation[]
  ): void {
    if (!persistence || observations.length === 0) {
      return
    }

    const sessionId = sessionLog.getExport().sessionId
    const writtenAt = Date.now()

    persist(persistence.recordObservations(
      observations.map((observation, index) => ({
        schemaVersion: 2 as const,
        id: `${sessionId}:${observation.code}:${writtenAt}:${index}`,
        sessionId,
        code: observation.code,
        type: observation.type,
        state: observation.state,
        observedAt: observation.observedAt
      }))
    ))
  }

  /**
   * Driver-facing diagnostic reads.
   *
   * Separate from the manual command box on purpose. That box is a raw
   * protocol tool and stays one: it sends what is typed and shows what came
   * back. This path goes through `readDiagnosticCodes`, so a vehicle that
   * answers nothing is reported as unconfirmed instead of as a failure.
   *
   * The executor is passed as a getter because `replaceTransport` swaps it
   * when the adapter changes; capturing it here would read through a
   * disposed object after the first reconnection.
   */
  const diagnostics = useVehicleDiagnostics({
    executor: () => executor.value,
    adapterConnected: () => sessionState.value === 'ready'
  })

  async function readDiagnosticTroubleCodes(mode: DtcModeKey): Promise<void> {
    const previous = diagnostics.reads.value.find(read => read.state === mode)
    const startedAt = Date.now()

    await diagnostics.read(mode)

    const outcome = diagnostics.reads.value.find(read => read.state === mode)

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

    persistObservations(observations)
  }

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
    syncTransportState()

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
    unsubscribePollResult = pollScheduler.value.onResult(({ result }) => {
      decodeAndRecordPid(result, 'telemetry')
    })

    unsubscribePollError = pollScheduler.value.onError(({ task, error }) => {
      recordError(error, 'poll', task.command)
    })

    unsubscribePollHalt = pollScheduler.value.onHalt(({ task }) => {
      // The scheduler already stopped itself; reflect the lost link in the UI
      // and seal the telemetry run so it does not look like it is still
      // polling.
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

    unsubscribeTransportState = transport.value.subscribeState(
      handleTransportStateChange
    )
  }

  function detachPollObservers(): void {
    unsubscribePollResult()
    unsubscribePollError()
    unsubscribePollHalt()
    unsubscribeTransportState()
  }

  attachPollObservers()

  function replaceTransport(next: ObdTransport): void {
    pollScheduler.value.stop()
    detachPollObservers()
    executor.value.dispose()

    transport.value = next
    executor.value = new ElmCommandExecutor(
      transport.value,
      event => sessionLog.record(event)
    )
    pollScheduler.value = new ObdPollScheduler(
      executor.value,
      { maxConsecutiveErrors: MAX_CONSECUTIVE_POLL_ERRORS }
    )

    attachPollObservers()
    syncTransportState()
  }

  function prepareSelectedTransport(): void {
    const next = createTransport(transportChoice.value)

    /**
     * Comparing kinds, not instances: the factory builds a fresh transport on
     * every call, and re-selecting the adapter already in use must not throw
     * away its state.
     */
    if (transport.value.kind !== next.kind) {
      replaceTransport(next)
    }
  }

  function transitionSession(
    next: Parameters<typeof session.transition>[0]
  ): void {
    session.transition(next)
    sessionState.value = session.state

    sessionLog.record({
      type: 'session-state',
      state: session.state
    })
  }

  function failSession(): void {
    session.fail()
    sessionState.value = session.state

    sessionLog.record({
      type: 'session-state',
      state: session.state
    })
  }

  function recordActivity(activity: ObdActivityEvent['activity']): void {
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
    getTransport: () => transport.value,
    getExecutor: () => executor.value,
    getPollScheduler: () => pollScheduler.value,
    getSupportedPids: () => supportedPids.value,
    onTelemetryStopped: () => {
      telemetryRunning.value = false
    },
    onTransportConnected: (metadata) => {
      selectedTransport = metadata
      syncTransportState()
      sessionLog.updateTransport(metadata)
    },
    onSupportedPidsResolved: (pids) => {
      supportedPids.value = pids
    }
  })

  function decodeAndRecordPid(
    result: ElmCommandResult,
    source: 'manual' | 'telemetry'
  ): void {
    try {
      const decoded = decodeMode01Response(result.normalizedText)

      if (!decoded) {
        return
      }

      telemetryDomainStore.update(decoded, result)

      syncTelemetryState()

      sessionLog.record({
        type: 'decoded-value',
        source,
        command: result.command,
        latencyMs: result.latencyMs,
        decoded: {
          kind: 'pid',
          ...decoded
        }
      })
    } catch (error) {
      recordError(error, 'decode', result.command)
    }
  }

  async function runQueueTest(): Promise<void> {
    sessionLog.record({
      type: 'activity',
      activity: 'queue-test-started'
    })

    const promises = QUEUE_TEST_COMMANDS.map(
      command => executor.value.execute(command)
    )

    try {
      const results = await Promise.all(promises)

      for (const result of results) {
        try {
          const decoded = decodeMode01Response(result.normalizedText)

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

  function startTelemetry(): void {
    if (sessionState.value !== 'ready') {
      recordError(new Error('Session is not ready'), 'poll')

      return
    }

    if (telemetryRunning.value) {
      return
    }

    pollScheduler.value.clearTasks()

    const tasks = createSupportedTelemetryPollTasks(
      supportedPids.value,
      { physicalOnly: isPhysicalTransportKind(transport.value.kind) }
    )

    for (const task of tasks) {
      pollScheduler.value.addTask(task)
    }

    if (tasks.length === 0) {
      recordError(new Error('No supported telemetry PIDs'), 'poll')

      return
    }

    pollScheduler.value.start()

    telemetryRunning.value = true

    sessionLog.record({
      type: 'telemetry-state',
      state: 'started'
    })
  }

  function stopTelemetry(): void {
    if (!telemetryRunning.value) {
      return
    }

    pollScheduler.value.stop()

    telemetryRunning.value = false

    sessionLog.record({
      type: 'telemetry-state',
      state: 'stopped'
    })
  }

  async function selectDevice(): Promise<void> {
    transportError.value = ''

    try {
      prepareSelectedTransport()
      sessionLog.start({ kind: transport.value.kind })

      transitionSession('selecting')

      selectedTransport = await transport.value.select()
      syncTransportState()
      sessionLog.updateTransport(selectedTransport)

      transitionSession('selected')

      sessionLog.record({
        type: 'activity',
        activity: 'adapter-selected'
      })
    } catch (error) {
      transportError.value = toError(error).message
      syncTransportState()
      failSession()

      recordError(error, 'selection')
    }
  }

  async function connect(): Promise<void> {
    transportError.value = ''

    if (sessionState.value !== 'selected') {
      sessionLog.start(selectedTransport)
    }

    try {
      transitionSession('connecting')

      selectedTransport = await transport.value.connect()
      syncTransportState()
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

      await initializeElm327(executor.value)

      sessionLog.record({
        type: 'activity',
        activity: 'initialization-completed'
      })

      transitionSession('discovering')

      sessionLog.record({
        type: 'activity',
        activity: 'discovery-started'
      })

      const discovery = await resolveSupportedPids(
        executor.value,
        selectedTransport,
        {
          cache: persistence,
          onCacheError: recordPersistenceError
        }
      )

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
      syncTransportState()
      failSession()

      recordError(error, 'connection')
    }
  }

  async function disconnect(): Promise<void> {
    transportError.value = ''

    try {
      stopTelemetry()

      clearTelemetryState()

      transitionSession('disconnecting')

      await transport.value.disconnect()
      syncTransportState()

      supportedPids.value = []

      transitionSession('disconnected')

      sessionLog.record({
        type: 'activity',
        activity: 'disconnected'
      })

      sessionLog.finish()
    } catch (error) {
      transportError.value = toError(error).message
      syncTransportState()
      failSession()

      recordError(error, 'disconnect')
    }
  }

  function recordManualDtcResponse(result: ElmCommandResult): void {
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

      persistObservations(observations)
    } catch (error) {
      recordError(error, 'decode', result.command)
    }
  }

  function recordManualSupportedPids(result: ElmCommandResult): void {
    try {
      const supported = decodeSupportedPids(result.normalizedText)

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

  async function sendCommand(): Promise<void> {
    const command = selectedCommand.value

    if (
      isPhysicalTransportKind(transport.value.kind)
      && !PHYSICAL_COMMANDS.includes(command)
    ) {
      recordError(
        new Error('Command is not allowed on the physical transport'),
        'transport-write',
        command
      )

      return
    }

    try {
      const timeoutMs = command === ADAPTER_STATUS_COMMAND
        ? ADAPTER_STATUS_TIMEOUT_MS
        : DEFAULT_COMMAND_TIMEOUT_MS

      const result = await executor.value.execute(command, timeoutMs)

      decodeAndRecordPid(result, 'manual')

      if (STORED_DTC_COMMANDS.includes(result.command)) {
        recordManualDtcResponse(result)
      }

      if (SUPPORTED_PID_COMMANDS.includes(result.command)) {
        recordManualSupportedPids(result)
      }
    } catch {
      // Protocol errors are already recorded by the executor.
    }
  }

  onScopeDispose(() => {
    reconnection.dispose()
    pollScheduler.value.stop()

    detachPollObservers()
    unsubscribeSessionLog()

    executor.value.dispose()

    if (
      transport.value.state !== 'idle'
      && transport.value.state !== 'disconnected'
    ) {
      void transport.value.disconnect().catch(() => undefined)
    }
  })

  return {
    sessionState,
    sessionBusy,
    transportState,
    transportChoice,
    transportError,
    supportedPids,
    telemetryRunning,
    selectedCommand,
    commands,

    engineRpmMetric,
    vehicleSpeedMetric,
    coolantTemperatureMetric,
    engineLoadMetric,
    throttlePositionMetric,

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
  }
}
