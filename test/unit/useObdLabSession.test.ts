import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { useObdLabSession } from '~/composables/useObdLabSession'
import {
  InMemoryObdPersistenceAdapter
} from '~~/core/obd/persistence/InMemoryObdPersistenceAdapter'
import { ReplayObdTransport } from '~~/core/obd/transport/ReplayObdTransport'
import type { ObdTransport } from '~~/core/obd/transport/ObdTransport'
import { provideNuxtInjections } from '../setup/nuxtMacros'
import { createSession, responseEvents } from '../fixtures/obdReplaySessions'

/**
 * The session used to live inside `pages/lab/index.vue`, so the only way to
 * reach a connected adapter was to mount a page, stub eight Nuxt UI
 * primitives and drive child components by emitting events at them. Those
 * page tests still exist and still matter — they prove the wiring between
 * the view and the session. These prove the session itself, with no
 * component, no DOM and no stubs.
 *
 * Nothing here is vehicle validation. A replayed transcript is a recording
 * of an adapter, not an adapter.
 */

/**
 * The six ELM327 setup commands the initializer sends, then one capability
 * range whose bitmask clears bit 0 — so the walk stops at 0100 instead of
 * asking for a range this transcript does not carry.
 */
function readySessionEvents() {
  return [
    ...responseEvents('c1', 'ATZ', ['ELM327 v1.5\r>'], 'ELM327 v1.5', 'at-ok'),
    ...responseEvents('c2', 'ATE0', ['OK\r>'], 'OK', 'at-ok'),
    ...responseEvents('c3', 'ATL0', ['OK\r>'], 'OK', 'at-ok'),
    ...responseEvents('c4', 'ATS0', ['OK\r>'], 'OK', 'at-ok'),
    ...responseEvents('c5', 'ATH0', ['OK\r>'], 'OK', 'at-ok'),
    ...responseEvents('c6', 'ATSP0', ['OK\r>'], 'OK', 'at-ok'),
    ...responseEvents('c7', '0100', ['4100BE3EB810\r>'], '4100BE3EB810')
  ]
}

/**
 * Runs the session inside its own effect scope, then stops it. Stopping the
 * scope is what fires `onScopeDispose`, so every test also exercises the
 * teardown the page used to run from `onBeforeUnmount`.
 */
async function withSession(
  transport: ObdTransport,
  body: (session: ReturnType<typeof useObdLabSession>) => Promise<void>
): Promise<void> {
  const scope = effectScope()
  const session = scope.run(() => useObdLabSession({
    createTransport: () => transport
  }))

  if (!session) {
    throw new Error('session scope produced nothing')
  }

  try {
    await body(session)
  } finally {
    scope.stop()
  }
}

async function connect(
  session: ReturnType<typeof useObdLabSession>
): Promise<void> {
  await session.selectDevice()

  expect(session.sessionState.value).toBe('selected')

  await session.connect()

  expect([
    session.sessionState.value,
    session.transportError.value
  ]).toEqual(['ready', ''])
}

describe('useObdLabSession', () => {
  it('reaches a ready session with no component mounted', async () => {
    await withSession(
      new ReplayObdTransport(createSession(readySessionEvents())),
      async (session) => {
        await connect(session)

        expect(session.supportedPids.value.length).toBeGreaterThan(0)
      }
    )
  })

  it('reports a lost link instead of holding a stale ready state', async () => {
    const transport = new ReplayObdTransport(
      createSession(readySessionEvents())
    )

    await withSession(transport, async (session) => {
      await connect(session)

      await transport.disconnect()

      await vi.waitFor(() => {
        const messages = session.sessionEvents.value
          .map(event => JSON.stringify(event))
          .join('\n')

        expect(messages).toContain('Transport link lost unexpectedly')
      })
    })
  })

  it('persists Mode 03 observations on the v2 boundary', async () => {
    const persistence = new InMemoryObdPersistenceAdapter()

    provideNuxtInjections({ $obdPersistence: persistence })

    const transport = new ReplayObdTransport(createSession([
      ...readySessionEvents(),
      ...responseEvents('c8', '03', ['4300430300\r>'], '4300430300')
    ]))

    await withSession(transport, async (session) => {
      await connect(session)

      await session.readDiagnosticTroubleCodes('stored')

      await vi.waitFor(async () => {
        const observations = await persistence.listObservations()

        expect(observations.length).toBeGreaterThan(0)
        expect(observations[0]).toMatchObject({
          schemaVersion: 2,
          state: 'stored'
        })
      })
    })
  })

  /**
   * The teardown the page could only run on unmount. Stopping the scope must
   * leave no adapter holding a live connection, because a session that keeps
   * a Bluetooth link open after the view is gone is a link nobody can close.
   */
  it('releases the adapter when its scope stops', async () => {
    const transport = new ReplayObdTransport(
      createSession(readySessionEvents())
    )

    await withSession(transport, async (session) => {
      await connect(session)

      expect(transport.state).toBe('connected')
    })

    await vi.waitFor(() => {
      expect(transport.state).toBe('disconnected')
    })
  })
})
