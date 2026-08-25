import { onScopeDispose, watch } from 'vue'
import type { Ref } from 'vue'

import { initializeElm327 } from '../../core/obd/protocol/Elm327Initializer'
import type { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { resolveSupportedPids } from '../../core/obd/capability/resolveSupportedPids'
import type { ObdPollScheduler } from '../../core/obd/polling/ObdPollScheduler'
import {
  ObdReconnectionController
} from '../../core/obd/session/ObdReconnectionController'
import type {
  ObdLinkSuspectReason
} from '../../core/obd/session/ObdReconnectionController'
import type { ObdSessionState } from '../../core/obd/session/ObdSessionStateMachine'
import type {
  ObdActivityEvent,
  ObdErrorPhase
} from '../../core/obd/logging/ObdSessionLog'
import type {
  ObdTransport,
  ObdTransportMetadata
} from '../../core/obd/transport/ObdTransport'

export interface UseObdReconnectionOptions {
  /**
   * Current session state, kept in sync by the caller's own transition
   * function. Watched with `flush: 'sync'` so a self-abort fires the moment
   * the state leaves `reconnecting` — inside the same synchronous call that
   * changed it, before the caller's next statement runs. This is what makes
   * the abort-before-disconnect ordering irrelevant: whoever moves the
   * session out of `reconnecting` aborts any in-flight attempt by
   * construction, whether or not they knew to call `abort()` first.
   */
  sessionState: Ref<ObdSessionState>
  transitionSession: (next: ObdSessionState) => void
  failSession: () => void
  recordActivity: (activity: ObdActivityEvent['activity']) => void
  recordError: (error: unknown, phase: ObdErrorPhase) => void

  /**
   * Read late, on every attempt, never captured at construction: the page
   * reassigns the underlying transport/executor/scheduler through
   * `replaceTransport`, and a captured reference would silently reconnect a
   * stale transport. `replaceTransport` itself is deliberately not part of
   * this surface — the composable has no way to call it, so "reconnection
   * never replaces the transport" holds structurally.
   */
  getTransport: () => ObdTransport
  getExecutor: () => ElmCommandExecutor
  getPollScheduler: () => ObdPollScheduler
  getSupportedPids: () => readonly string[]

  onTelemetryStopped: () => void
  onTransportConnected: (metadata: ObdTransportMetadata) => void
  onSupportedPidsResolved: (pids: string[]) => void

  delaysMs?: readonly number[]
  deadlineMs?: number
  now?: () => number
}

export function useObdReconnection(
  options: UseObdReconnectionOptions
) {
  async function reconnectAttempt(): Promise<void> {
    const pollScheduler = options.getPollScheduler()

    pollScheduler.stop()
    pollScheduler.clearTasks()
    options.onTelemetryStopped()

    options.recordActivity('reconnect-attempt')

    const transport = options.getTransport()

    try {
      await transport.disconnect()
    } catch (error) {
      options.recordError(error, 'disconnect')
    }

    const metadata = await transport.connect()
    options.onTransportConnected(metadata)

    const executor = options.getExecutor()
    await initializeElm327(executor)

    const resolved = await resolveSupportedPids(executor, metadata, {
      reconnect: true,
      supportedPids: options.getSupportedPids()
    })
    options.onSupportedPidsResolved(resolved.pids)
  }

  const controller = new ObdReconnectionController({
    delaysMs: options.delaysMs,
    deadlineMs: options.deadlineMs,
    now: options.now,
    onEnter: () => {
      options.transitionSession('reconnecting')
      options.recordActivity('reconnect-started')
    },
    attempt: reconnectAttempt,
    onRecovered: () => {
      options.transitionSession('initializing')
      options.recordActivity('initialization-completed')

      options.transitionSession('discovering')
      options.recordActivity('discovery-completed')

      options.transitionSession('ready')
      options.recordActivity('reconnected')
    },
    onAttemptFailed: (_, error) => {
      options.recordError(error, 'disconnect')
    },
    onFailed: ({ error }) => {
      options.failSession()
      options.recordActivity('reconnect-failed')
      options.recordError(
        error ?? new Error('Reconnect attempts exhausted'),
        'disconnect'
      )
    },
    onSignalSuppressed: (reason) => {
      options.recordError(
        new Error(`Reconnect signal suppressed: ${reason}`),
        'disconnect'
      )
    }
  })

  // Self-abort: the moment the session leaves 'reconnecting' while a run is
  // active — for any reason, called by anyone, in any order — the in-flight
  // attempt is cancelled. No caller needs to remember to call abort() first.
  const stopWatchingSessionState = watch(
    options.sessionState,
    (state) => {
      if (controller.active && state !== 'reconnecting') {
        controller.abort('user-disconnect')
      }
    },
    { flush: 'sync' }
  )

  onScopeDispose(() => {
    stopWatchingSessionState()
    controller.dispose()
  })

  function notifyLinkSuspect(
    reason: ObdLinkSuspectReason
  ): boolean {
    if (
      options.sessionState.value === 'ready'
      || controller.active
    ) {
      return controller.notifyLinkSuspect(reason)
    }

    return false
  }

  function dispose(): void {
    controller.dispose()
  }

  function isActive(): boolean {
    return controller.active
  }

  return {
    notifyLinkSuspect,
    dispose,
    isActive
  }
}
