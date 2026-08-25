import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { Ref } from 'vue'

import { useObdReconnection } from '../../app/composables/useObdReconnection'
import type { ObdActivityEvent, ObdErrorPhase } from '../../core/obd/logging/ObdSessionLog'
import { ObdSessionLog } from '../../core/obd/logging/ObdSessionLog'
import { PHYSICAL_ALLOWED_COMMANDS } from '../../core/obd/policy/PhysicalObdCommandPolicy'
import { ObdPollScheduler } from '../../core/obd/polling/ObdPollScheduler'
import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { initializeElm327 } from '../../core/obd/protocol/Elm327Initializer'
import type { ObdSessionState } from '../../core/obd/session/ObdSessionStateMachine'
import { ObdSessionStateMachine } from '../../core/obd/session/ObdSessionStateMachine'
import { ReplayObdTransport } from '../../core/obd/transport/ReplayObdTransport'
import { buildReconnectSession } from '../fixtures/obdReplaySessions'

/**
 * Everything below drives the real `useObdReconnection` composable — the
 * extracted unit the shipped page wires up — never a hand-rolled replica of
 * it. `replaceTransport` is never passed in, so "reconnection never replaces
 * the transport" needs no assertion: the composable has nothing to call.
 */
function buildHarness(controllerOptions: {
  delaysMs?: readonly number[]
  deadlineMs?: number
} = {}) {
  const transport = new ReplayObdTransport(
    buildReconnectSession(),
    { timingScale: 0 }
  )
  const commands: string[] = []
  const executor = new ElmCommandExecutor(transport, (event) => {
    if (event.type === 'tx') commands.push(event.command)
  })
  let pollScheduler = new ObdPollScheduler(executor)
  const supportedPids: string[] = []

  const session = new ObdSessionStateMachine()
  const sessionState: Ref<ObdSessionState> = ref(session.state)
  const transitions: ObdSessionState[] = []
  const activities: string[] = []
  const errors: string[] = []

  const log = new ObdSessionLog({
    transport: { kind: 'replay' },
    idFactory: () => 'same-session'
  })
  const logChanges: string[] = []
  log.subscribe(change => logChanges.push(change.type))

  function transitionSession(next: ObdSessionState): void {
    session.transition(next)
    sessionState.value = session.state
    transitions.push(session.state)
    log.record({ type: 'session-state', state: session.state })
  }

  function failSession(): void {
    session.fail()
    sessionState.value = session.state
    transitions.push(session.state)
    log.record({ type: 'session-state', state: session.state })
  }

  function recordActivity(
    activity: ObdActivityEvent['activity']
  ): void {
    activities.push(activity)
    log.record({ type: 'activity', activity })
  }

  function recordError(error: unknown, phase: ObdErrorPhase): void {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(message)
    log.record({
      type: 'error',
      error: { name: 'Error', message, phase }
    })
  }

  const scope = effectScope()
  const reconnection = scope.run(() => useObdReconnection({
    sessionState,
    transitionSession,
    failSession,
    recordActivity,
    recordError,
    getTransport: () => transport,
    getExecutor: () => executor,
    getPollScheduler: () => pollScheduler,
    getSupportedPids: () => supportedPids,
    onTelemetryStopped: () => {},
    onTransportConnected: () => {},
    onSupportedPidsResolved: (pids) => {
      supportedPids.splice(0, supportedPids.length, ...pids)
    },
    ...controllerOptions
  }))!

  return {
    scope,
    transport,
    executor,
    commands,
    session,
    sessionState,
    transitionSession,
    transitions,
    activities,
    errors,
    log,
    logChanges,
    reconnection,
    replacePollScheduler: (next: ObdPollScheduler) => {
      pollScheduler = next
    }
  }
}

async function bootstrapToReady(
  harness: ReturnType<typeof buildHarness>
): Promise<void> {
  harness.log.start({ kind: 'replay' })
  await harness.transport.select()
  await harness.transport.connect()
  await initializeElm327(harness.executor)

  for (const next of [
    'selecting',
    'selected',
    'connecting',
    'initializing',
    'discovering',
    'ready'
  ] as const) {
    harness.transitionSession(next)
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useObdReconnection', () => {
  it('routes both link-suspect signals fired in the same tick into exactly one attempt sequence, replaying the full ready -> reconnecting -> initializing -> discovering -> ready recovery with the same session and only PHYSICAL_ALLOWED_COMMANDS', async () => {
    vi.useFakeTimers()

    const harness = buildHarness({ delaysMs: [0] })

    await bootstrapToReady(harness)

    const originalTransport = harness.transport
    const originalExecutor = harness.executor
    const initialCommandCount = harness.commands.length
    const transitionsBeforeReconnect = harness.transitions.length

    expect(harness.reconnection.notifyLinkSuspect('transport-state')).toBe(true)
    expect(harness.reconnection.notifyLinkSuspect('poll-halt')).toBe(false)

    await vi.runAllTimersAsync()

    // Exactly one attempt sequence: the first-wins latch inside
    // ObdReconnectionController suppresses the second signal, and the
    // suppression itself becomes session-log evidence rather than being
    // silently dropped.
    expect(
      harness.activities.filter(activity => activity === 'reconnect-attempt')
    ).toHaveLength(1)
    expect(
      harness.errors.some(message => message.includes(
        'Reconnect signal suppressed: poll-halt'
      ))
    ).toBe(true)

    expect(
      harness.transitions.slice(transitionsBeforeReconnect)
    ).toEqual(['reconnecting', 'initializing', 'discovering', 'ready'])

    expect(harness.reconnection.isActive()).toBe(false)

    const reconnectCommands = harness.commands.slice(initialCommandCount)

    expect(reconnectCommands).toEqual([
      'ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0'
    ])
    expect(reconnectCommands.every(command => (
      PHYSICAL_ALLOWED_COMMANDS.includes(
        command as typeof PHYSICAL_ALLOWED_COMMANDS[number]
      )
    ))).toBe(true)
    expect(reconnectCommands.some(command => command.startsWith('04')))
      .toBe(false)

    // Same session survives: one 'started' change, a 'reconnected'
    // activity (not a second 'started'), same sessionId throughout.
    expect(harness.logChanges.filter(change => change === 'started'))
      .toHaveLength(1)
    expect(harness.log.getExport().sessionId).toBe('same-session')
    expect(harness.activities).toContain('reconnected')
    expect(harness.log.getExport().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'activity', activity: 'reconnected' })
    ]))

    // Transport and executor identity preserved: the composable was never
    // given replaceTransport, so it could not have substituted either.
    expect(harness.transport).toBe(originalTransport)
    expect(harness.executor).toBe(originalExecutor)

    harness.executor.dispose()
    harness.scope.stop()
  })

  it('ignores a link-suspect signal while the session is neither ready nor already reconnecting', () => {
    const harness = buildHarness()

    expect(harness.session.state).toBe('idle')
    expect(harness.reconnection.notifyLinkSuspect('manual')).toBe(false)
    expect(harness.reconnection.isActive()).toBe(false)
    expect(harness.activities).toHaveLength(0)

    harness.executor.dispose()
    harness.scope.stop()
  })

  it('self-aborts and cannot leave the session broken when a disconnect races an in-flight reconnect attempt, with no abort() for a caller to sequence wrong', async () => {
    vi.useFakeTimers()

    const transport = new ReplayObdTransport(
      buildReconnectSession(),
      { timingScale: 0 }
    )
    const executor = new ElmCommandExecutor(transport)
    const pollScheduler = new ObdPollScheduler(executor)
    const supportedPids: string[] = []
    const session = new ObdSessionStateMachine()
    const sessionState: Ref<ObdSessionState> = ref(session.state)
    const transitions: ObdSessionState[] = []

    function transitionSession(next: ObdSessionState): void {
      session.transition(next)
      sessionState.value = session.state
      transitions.push(session.state)
    }

    function failSession(): void {
      session.fail()
      sessionState.value = session.state
      transitions.push(session.state)
    }

    await transport.select()
    await transport.connect()
    await initializeElm327(executor)

    for (const next of [
      'selecting', 'selected', 'connecting', 'initializing', 'discovering', 'ready'
    ] as const) {
      transitionSession(next)
    }

    const scope = effectScope()
    const reconnection = scope.run(() => useObdReconnection({
      sessionState,
      transitionSession,
      failSession,
      recordActivity: () => {},
      recordError: () => {},
      getTransport: () => transport,
      getExecutor: () => executor,
      getPollScheduler: () => pollScheduler,
      getSupportedPids: () => supportedPids,
      onTelemetryStopped: () => {},
      // This fires mid-attempt, right after the reconnect's own
      // transport.connect() resolves — exactly the load-bearing race: the
      // page's disconnect() flips the session state directly, never
      // calling an abort() (there isn't one to call), before the pending
      // attempt promise settles.
      onTransportConnected: () => {
        if (sessionState.value === 'reconnecting') {
          transitionSession('disconnecting')
        }
      },
      onSupportedPidsResolved: (pids) => {
        supportedPids.splice(0, supportedPids.length, ...pids)
      },
      delaysMs: [0]
    }))!

    const transitionsBeforeReconnect = transitions.length

    expect(reconnection.notifyLinkSuspect('transport-state')).toBe(true)

    await vi.runAllTimersAsync()

    // onRecovered never attempted the disconnecting -> initializing
    // transition ObdSessionStateMachine would reject: the session is
    // exactly where the user's disconnect left it, not stuck or thrown.
    expect(session.state).toBe('disconnecting')
    expect(transitions.slice(transitionsBeforeReconnect))
      .not.toContain('initializing')
    expect(reconnection.isActive()).toBe(false)

    // The session can still complete a normal disconnect afterwards.
    expect(() => transitionSession('disconnected')).not.toThrow()

    executor.dispose()
    scope.stop()
  })

  it('self-aborts before the first attempt even runs when the session leaves reconnecting before the delay elapses', async () => {
    vi.useFakeTimers()

    const harness = buildHarness({ delaysMs: [0] })

    await bootstrapToReady(harness)

    expect(harness.reconnection.notifyLinkSuspect('transport-state')).toBe(true)
    expect(harness.session.state).toBe('reconnecting')

    // The disconnect happens before the controller's delay even elapses —
    // no explicit abort call exists to have gotten in the wrong order.
    harness.transitionSession('disconnecting')

    await vi.runAllTimersAsync()

    expect(harness.activities.filter(activity => activity === 'reconnect-attempt'))
      .toHaveLength(0)
    expect(harness.session.state).toBe('disconnecting')
    expect(harness.reconnection.isActive()).toBe(false)

    harness.executor.dispose()
    harness.scope.stop()
  })
})
