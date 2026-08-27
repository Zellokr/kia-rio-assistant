import { describe, expect, it } from 'vitest'
import { InMemoryObdPersistenceAdapter } from '../../core/obd/persistence/InMemoryObdPersistenceAdapter'
import { ObdSessionStateMachine } from '../../core/obd/session/ObdSessionStateMachine'
import { createSupportedTelemetryPollTasks } from '../../core/obd/telemetry/createSupportedTelemetryPollTasks'

/**
 * The page-level half of this contract — that a failing write is routed away
 * from the session instead of blocking it — lives in
 * `labPageBehaviour`'s sibling `labPagePersistence`, which mounts the page.
 * What stays here is the core behaviour the page composes.
 */
describe('OBD persistence wiring', () => {
  it('does not create unsupported telemetry poll tasks', () => {
    expect(createSupportedTelemetryPollTasks(['0C']).map(task => task.command))
      .toEqual(['010C'])
    expect(createSupportedTelemetryPollTasks(['0C']).some(task => task.command === '0146'))
      .toBe(false)
  })

  it('leaves a ready session and its poll tasks usable after quota failure', async () => {
    const persistence = new InMemoryObdPersistenceAdapter({
      onWrite: () => { throw new Error('quota') }
    })
    const session = new ObdSessionStateMachine()
    for (const state of ['selecting', 'selected', 'connecting', 'initializing', 'discovering', 'ready'] as const) session.transition(state)
    await persistence.startSession({ schemaVersion: 1, sessionId: 'one', startedAt: '', endedAt: null, transport: { kind: 'mock' }, reconnectCount: 0, truncated: false })
    expect([session.state, createSupportedTelemetryPollTasks(['0C']).length])
      .toEqual(['ready', 1])
  })
})
