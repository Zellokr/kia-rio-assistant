import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import type { DiagnosticAssessment } from '../../core/obd/diagnostics/assessDiagnostics'
import {
  InMemoryObdPersistenceAdapter
} from '../../core/obd/persistence/InMemoryObdPersistenceAdapter'
import type {
  PersistedDiagnosticAssessment,
  PersistedMaintenanceRecord,
  PersistedObdSessionRecord
} from '../../core/obd/persistence/ports'
import { IndexedDbAdapter } from '../../data/indexeddb/IndexedDbAdapter'
import { DB_NAME, openObdDatabase } from '../../data/indexeddb/migrations'
import { createObdStores, OBD_STORES } from '../../data/indexeddb/stores'

/**
 * RF-034's two missing halves: evaluations and maintenance.
 *
 * The store already kept sessions, events, DTC observations and the PID
 * cache. RF-034 asks for *"sesiones, DTC, evaluaciones y mantenimientos"*, so
 * these are the two stores DB v2 adds.
 *
 * The two record kinds are deliberately not symmetric, and the difference is
 * the point of several tests below. An assessment belongs to a session: it is
 * derived data that means nothing once the session it describes is gone, so it
 * follows that session through deletion and through eviction. A maintenance
 * record is something the owner typed — a date and an odometer reading no ECU
 * supplies (RF-036) — so nothing in the session lifecycle may remove it.
 *
 * The IndexedDB half runs against fake-indexeddb, NOT the Android WebView.
 * That is polyfill coverage, not device validation.
 */

function session(id: string, startedAt: string): PersistedObdSessionRecord {
  return {
    schemaVersion: 1,
    sessionId: id,
    startedAt,
    endedAt: null,
    transport: { kind: 'mock' },
    reconnectCount: 0,
    truncated: false
  }
}

function startedAt(index: number): string {
  return `2026-09-01T20:00:${String(index).padStart(2, '0')}.000Z`
}

function assessmentValue(): DiagnosticAssessment {
  return {
    severity: 'warning',
    confidence: 'medium',
    dtcs: ['P0133'],
    evidence: [{ type: 'dtc', description: 'Sonda lambda lenta' }],
    possibleCauses: ['Sonda lambda degradada'],
    immediateAction: 'Puedes seguir conduciendo con precaución.',
    recommendedChecks: ['Revisar la sonda lambda del banco 1'],
    limitations: ['No se ha confirmado la causa mediante OBD-II']
  }
}

function assessment(
  id: string,
  sessionId: string
): PersistedDiagnosticAssessment {
  return {
    schemaVersion: 1,
    id,
    sessionId,
    recordedAt: `2026-09-01T21:00:${id.padStart(2, '0')}.000Z`,
    assessment: assessmentValue()
  }
}

function maintenance(id: string): PersistedMaintenanceRecord {
  return {
    schemaVersion: 1,
    id,
    performedAt: `2026-0${id}-15`,
    odometerKm: 90_000 + Number(id),
    item: 'Cambio de aceite y filtro',
    notes: null
  }
}

/**
 * Both adapters implement the same ports, so the behaviour that matters is
 * asserted against both. The in-memory one is not a test double for the
 * IndexedDB one — the app uses it wherever IndexedDB is absent — so a
 * behaviour proven in only one of them is proven for only half the product.
 */
const adapters = [
  {
    name: 'in-memory',
    create: () => new InMemoryObdPersistenceAdapter()
  },
  {
    name: 'IndexedDB (fake-indexeddb)',
    create: () => new IndexedDbAdapter(new IDBFactory())
  }
] as const

describe.each(adapters)('$name persistence — assessments', ({ create }) => {
  it('round-trips an assessment with schemaVersion intact', async () => {
    const adapter = create()

    await adapter.startSession(session('one', startedAt(1)))
    await adapter.recordAssessment(assessment('1', 'one'))

    expect(await adapter.listAssessments()).toEqual([assessment('1', 'one')])
  })

  it('deletes an assessment on request', async () => {
    const adapter = create()

    await adapter.startSession(session('one', startedAt(1)))
    await adapter.recordAssessment(assessment('1', 'one'))
    await adapter.recordAssessment(assessment('2', 'one'))
    await adapter.deleteAssessment('1')

    expect(await adapter.listAssessments()).toEqual([assessment('2', 'one')])
  })

  it('removes a session\'s assessments when that session is deleted', async () => {
    const adapter = create()

    await adapter.startSession(session('one', startedAt(1)))
    await adapter.startSession(session('two', startedAt(2)))
    await adapter.recordAssessment(assessment('1', 'one'))
    await adapter.recordAssessment(assessment('2', 'two'))

    await adapter.deleteSession('one')

    expect(await adapter.listAssessments()).toEqual([assessment('2', 'two')])
  })

  it('drops the assessments of a session that rolls off at the twenty-first', async () => {
    const adapter = create()

    for (let index = 1; index <= 21; index++) {
      const id = String(index)

      await adapter.startSession(session(id, startedAt(index)))
      await adapter.recordAssessment(assessment(id, id))
    }

    const surviving = await adapter.listAssessments()

    expect(surviving).toHaveLength(20)
    expect(surviving.some(record => record.sessionId === '1')).toBe(false)
    expect(surviving.some(record => record.sessionId === '21')).toBe(true)
  })
})

describe.each(adapters)('$name persistence — maintenance', ({ create }) => {
  it('round-trips an owner-entered maintenance record', async () => {
    const adapter = create()

    await adapter.saveMaintenanceRecord(maintenance('1'))

    expect(await adapter.listMaintenanceRecords()).toEqual([maintenance('1')])
  })

  it('updates a record written under the same id instead of duplicating it', async () => {
    const adapter = create()
    const corrected = { ...maintenance('1'), odometerKm: 91_500 }

    await adapter.saveMaintenanceRecord(maintenance('1'))
    await adapter.saveMaintenanceRecord(corrected)

    expect(await adapter.listMaintenanceRecords()).toEqual([corrected])
  })

  it('deletes a maintenance record on request', async () => {
    const adapter = create()

    await adapter.saveMaintenanceRecord(maintenance('1'))
    await adapter.saveMaintenanceRecord(maintenance('2'))
    await adapter.deleteMaintenanceRecord('1')

    expect(await adapter.listMaintenanceRecords()).toEqual([maintenance('2')])
  })

  it('keeps maintenance records when every session is deleted', async () => {
    const adapter = create()

    await adapter.saveMaintenanceRecord(maintenance('1'))
    await adapter.startSession(session('one', startedAt(1)))
    await adapter.deleteSession('one')

    expect(await adapter.listMaintenanceRecords()).toEqual([maintenance('1')])
  })

  it('keeps maintenance records while twenty-one sessions roll through', async () => {
    const adapter = create()

    await adapter.saveMaintenanceRecord(maintenance('1'))

    for (let index = 1; index <= 21; index++) {
      await adapter.startSession(session(String(index), startedAt(index)))
    }

    expect(await adapter.listMaintenanceRecords()).toEqual([maintenance('1')])
  })
})

describe('IndexedDB migration to v2', () => {
  let factory: IDBFactory

  beforeEach(() => {
    factory = new IDBFactory()
  })

  it('creates the two new stores with their keyPaths and indexes', async () => {
    const database = await openObdDatabase(factory)

    expect([...database.objectStoreNames]).toContain(OBD_STORES.assessments)
    expect([...database.objectStoreNames]).toContain(OBD_STORES.maintenance)

    const transaction = database.transaction([...database.objectStoreNames])

    const assessments = transaction.objectStore(OBD_STORES.assessments)
    expect(assessments.keyPath).toBe('id')
    expect([...assessments.indexNames].sort()).toEqual(['recordedAt', 'sessionId'])

    const records = transaction.objectStore(OBD_STORES.maintenance)
    expect(records.keyPath).toBe('id')
    expect([...records.indexNames]).toEqual(['performedAt'])

    database.close()
  })

  it('upgrades a populated v1 database without losing its rows', async () => {
    // A database as an existing install would have left it: version 1, four
    // stores, one session already written.
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, 1)

      request.onupgradeneeded = () => createObdStores(request.result)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    await new Promise<void>((resolve, reject) => {
      const transaction = legacy.transaction(OBD_STORES.sessions, 'readwrite')

      transaction.objectStore(OBD_STORES.sessions).put(session('kept', startedAt(1)))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })

    legacy.close()

    const adapter = new IndexedDbAdapter(factory)

    expect(await adapter.listSessions()).toEqual([session('kept', startedAt(1))])

    // And the upgraded database can now hold what v1 had nowhere to put.
    await adapter.recordAssessment(assessment('1', 'kept'))
    await adapter.saveMaintenanceRecord(maintenance('1'))

    expect(await adapter.listAssessments()).toEqual([assessment('1', 'kept')])
    expect(await adapter.listMaintenanceRecords()).toEqual([maintenance('1')])
  })
})
