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
import { DTC_MODES } from '~~/core/obd/decoder/decodeDtcResponse'
import { ObdSessionLog } from '~~/core/obd/logging/ObdSessionLog'
import { ObdPollScheduler } from '~~/core/obd/polling/ObdPollScheduler'
import {
  ElmCommandExecutor
} from '~~/core/obd/protocol/ElmCommandExecutor'
import { initializeElm327 } from '~~/core/obd/protocol/Elm327Initializer'
import {
  ObdSessionStateMachine
} from '~~/core/obd/session/ObdSessionStateMachine'
import type {
  ObdSessionState
} from '~~/core/obd/session/ObdSessionStateMachine'
import {
  isObdTransportUnavailable
} from '~~/core/obd/transport/ObdTransport'
import type {
  ObdTransport,
  ObdTransportMetadata,
  ObdTransportState
} from '~~/core/obd/transport/ObdTransport'
import { useObdReconnection } from '~/composables/useObdReconnection'
import { useObdManualCommands } from '~/composables/useObdManualCommands'
import { useObdSessionRecording } from '~/composables/useObdSessionRecording'
import { useObdTelemetryPolling } from '~/composables/useObdTelemetryPolling'
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
 * Everything the lab page needs to drive one OBD-II session.
 *
 * This used to live inline in the lab page component, which made the route
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
  const sessionState = ref<ObdSessionState>(session.state)
  const transportChoice = ref<ObdTransportChoice>('android-ble')
  const transportError = ref('')

  let selectedTransport: ObdTransportMetadata = {
    kind: transport.value.kind
  }

  const {
    persistence,
    events: sessionEvents,
    droppedEvents,
    truncated: logTruncated,
    clearDisplay: clearLog,
    downloadJson: downloadSessionLog,
    copyJson: copySessionLog,
    telegramEnabled,
    sendFieldReport,
    toError,
    recordError,
    recordActivity,
    recordPersistenceError,
    persistObservations
  } = useObdSessionRecording(sessionLog)

  const {
    metrics: telemetry,
    running: telemetryRunning,
    decodePid,
    attachObservers: attachTelemetryObservers,
    detachObservers: detachTelemetryObservers,
    start: startTelemetry,
    stop: stopTelemetry,
    markStopped: markTelemetryStopped,
    clear: clearTelemetryState
  } = useObdTelemetryPolling({
    sessionLog,
    recordError,
    getPollScheduler: () => pollScheduler.value,
    getTransportKind: () => transport.value.kind,
    getSupportedPids: () => supportedPids.value,
    getSessionState: () => sessionState.value,
    onLinkSuspect: reason => reconnection.notifyLinkSuspect(reason)
  })

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

  let unsubscribeTransportState = () => {}

  function handleTransportStateChange(state: ObdTransportState): void {
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

  function attachObservers(): void {
    attachTelemetryObservers()

    unsubscribeTransportState = transport.value.subscribeState(
      handleTransportStateChange
    )
  }

  function detachObservers(): void {
    detachTelemetryObservers()
    unsubscribeTransportState()
  }

  /**
   * Registered before `reconnection` exists. That is safe and load-bearing:
   * the halt handler only reaches it when a poll run fails, which cannot
   * happen before telemetry has been started, long after the controller is
   * built. Moving this below the controller would leave the first transport
   * unobserved.
   */
  attachObservers()

  function replaceTransport(next: ObdTransport): void {
    pollScheduler.value.stop()
    detachObservers()
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

    attachObservers()
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
    onTelemetryStopped: markTelemetryStopped,
    onTransportConnected: (metadata) => {
      selectedTransport = metadata
      sessionLog.updateTransport(metadata)
    },
    onSupportedPidsResolved: (pids) => {
      supportedPids.value = pids
    }
  })

  const {
    selectedCommand,
    commands,
    sendCommand,
    runQueueTest
  } = useObdManualCommands({
    sessionLog,
    transportChoice,
    getExecutor: () => executor.value,
    getTransportKind: () => transport.value.kind,
    recordError,
    persistObservations,
    decodePid
  })

  async function selectDevice(): Promise<void> {
    transportError.value = ''

    try {
      prepareSelectedTransport()
      sessionLog.start({ kind: transport.value.kind })

      transitionSession('selecting')

      selectedTransport = await transport.value.select()
      sessionLog.updateTransport(selectedTransport)

      transitionSession('selected')

      sessionLog.record({
        type: 'activity',
        activity: 'adapter-selected'
      })
    } catch (error) {
      transportError.value = toError(error).message
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

      supportedPids.value = []

      transitionSession('disconnected')

      sessionLog.record({
        type: 'activity',
        activity: 'disconnected'
      })

      sessionLog.finish()
    } catch (error) {
      transportError.value = toError(error).message
      failSession()

      recordError(error, 'disconnect')
    }
  }

  onScopeDispose(() => {
    reconnection.dispose()
    pollScheduler.value.stop()

    detachObservers()

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
  }
}
