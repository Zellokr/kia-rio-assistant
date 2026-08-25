import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { InMemoryObdPersistenceAdapter } from '../../core/obd/persistence/InMemoryObdPersistenceAdapter'
import { ObdSessionStateMachine } from '../../core/obd/session/ObdSessionStateMachine'
import { createSupportedTelemetryPollTasks } from '../../core/obd/telemetry/createSupportedTelemetryPollTasks'

const source = readFileSync(fileURLToPath(new URL('../../app/pages/lab/index.vue', import.meta.url)), 'utf8')

describe('OBD persistence wiring', () => {
  it('keeps persistence non-blocking and records DTCs from Mode 03', () => {
    expect(source).toContain('void operation.catch(recordPersistenceError)')
    expect(source).toContain('new BufferedObdSessionRecorder')
    expect(source).toContain('persistence.recordObservations')
  })

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
