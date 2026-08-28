import { ref } from 'vue'

import {
  decodeMode01Response
} from '~~/core/obd/decoder/decodeMode01Response'
import type {
  ObdErrorPhase,
  ObdSessionLog
} from '~~/core/obd/logging/ObdSessionLog'
import type { ObdPollScheduler } from '~~/core/obd/polling/ObdPollScheduler'
import type {
  ElmCommandResult
} from '~~/core/obd/protocol/ElmCommandExecutor'
import type {
  ObdSessionState
} from '~~/core/obd/session/ObdSessionStateMachine'
import {
  createSupportedTelemetryPollTasks
} from '~~/core/obd/telemetry/createSupportedTelemetryPollTasks'
import { ObdTelemetryStore } from '~~/core/obd/telemetry/ObdTelemetryStore'
import {
  isPhysicalTransportKind
} from '~~/core/obd/transport/ObdTransport'
import type {
  ObdTransportMetadata
} from '~~/core/obd/transport/ObdTransport'
import { useObdTelemetry } from '~/composables/useObdTelemetry'

export interface ObdTelemetryPollingOptions {
  readonly sessionLog: ObdSessionLog
  readonly recordError: (
    error: unknown,
    phase: ObdErrorPhase,
    command?: string
  ) => void
  /**
   * Read late, all three: the lab replaces its poll scheduler whenever the
   * adapter changes, and capturing any of these would drive a disposed one.
   */
  readonly getPollScheduler: () => ObdPollScheduler
  readonly getTransportKind: () => ObdTransportMetadata['kind']
  readonly getSupportedPids: () => string[]
  readonly getSessionState: () => ObdSessionState
  /**
   * Called when repeated poll failures suggest the link is gone. The
   * reconnection controller is built after this composable — the session
   * needs somewhere to send polls before it can decide what to do about
   * them failing — so it arrives through a callback rather than a value.
   */
  readonly onLinkSuspect: (reason: 'poll-halt') => void
}

/**
 * Live readings: the domain store, its reactive mirror, and the scheduler
 * observers that fill both.
 *
 * The decode path is shared with the manual command box, because a Mode 01
 * answer means the same thing whether a driver typed it or the scheduler
 * asked for it. The queue test deliberately does not use it; see
 * `useObdManualCommands`.
 *
 * Observers attach and detach explicitly rather than on scope disposal. The
 * caller re-attaches them every time it swaps the transport, which is not a
 * lifecycle event any scope can see.
 */
export function useObdTelemetryPolling(options: ObdTelemetryPollingOptions) {
  const {
    sessionLog,
    recordError,
    getPollScheduler,
    getTransportKind,
    getSupportedPids,
    getSessionState,
    onLinkSuspect
  } = options

  const store = new ObdTelemetryStore()
  const running = ref(false)

  const {
    metrics,
    setSnapshot,
    clear: clearReactive
  } = useObdTelemetry()

  let unsubscribeResult = () => {}
  let unsubscribeError = () => {}
  let unsubscribeHalt = () => {}

  function syncSnapshot(): void {
    setSnapshot(store.getSnapshot())
  }

  function clear(): void {
    store.clear()
    clearReactive()
  }

  function decodePid(
    result: ElmCommandResult,
    source: 'manual' | 'telemetry'
  ): void {
    try {
      const decoded = decodeMode01Response(result.normalizedText)

      if (!decoded) {
        return
      }

      store.update(decoded, result)

      syncSnapshot()

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

  function attachObservers(): void {
    const scheduler = getPollScheduler()

    unsubscribeResult = scheduler.onResult(({ result }) => {
      decodePid(result, 'telemetry')
    })

    unsubscribeError = scheduler.onError(({ task, error }) => {
      recordError(error, 'poll', task.command)
    })

    unsubscribeHalt = scheduler.onHalt(({ task }) => {
      // The scheduler already stopped itself; reflect the lost link in the UI
      // and seal the telemetry run so it does not look like it is still
      // polling.
      running.value = false

      recordError(
        new Error('Telemetry stopped after repeated poll failures'),
        'poll',
        task.command
      )

      sessionLog.record({
        type: 'telemetry-state',
        state: 'stopped'
      })

      onLinkSuspect('poll-halt')
    })
  }

  function detachObservers(): void {
    unsubscribeResult()
    unsubscribeError()
    unsubscribeHalt()
  }

  function start(): void {
    if (getSessionState() !== 'ready') {
      recordError(new Error('Session is not ready'), 'poll')

      return
    }

    if (running.value) {
      return
    }

    const scheduler = getPollScheduler()

    scheduler.clearTasks()

    const tasks = createSupportedTelemetryPollTasks(
      getSupportedPids(),
      { physicalOnly: isPhysicalTransportKind(getTransportKind()) }
    )

    for (const task of tasks) {
      scheduler.addTask(task)
    }

    if (tasks.length === 0) {
      recordError(new Error('No supported telemetry PIDs'), 'poll')

      return
    }

    scheduler.start()

    running.value = true

    sessionLog.record({
      type: 'telemetry-state',
      state: 'started'
    })
  }

  function stop(): void {
    if (!running.value) {
      return
    }

    getPollScheduler().stop()

    running.value = false

    sessionLog.record({
      type: 'telemetry-state',
      state: 'stopped'
    })
  }

  /**
   * Marks the run as finished without touching the scheduler, for the paths
   * that already stopped it — a reconnection, or a halt the scheduler
   * decided on its own.
   */
  function markStopped(): void {
    running.value = false
  }

  return {
    metrics,
    running,
    decodePid,
    attachObservers,
    detachObservers,
    start,
    stop,
    markStopped,
    clear
  }
}
