import type {
  DiagnosticAssessmentRepository,
  DtcRepository,
  MaintenanceRepository,
  ObdSessionRepository,
  PersistedDiagnosticAssessment,
  PersistedDtcObservation,
  PersistedDtcObservationRecord,
  PersistedObdSessionEventRecord,
  PersistedMaintenanceRecord,
  PersistedObdSessionRecord,
  PersistedSupportedPidCache,
  SupportedPidCacheRepository
} from '~~/core/obd/persistence/ports'
import type {
  SyncOperation,
  SyncQueueRepository
} from '~~/core/sync/ports'
import { isPersistedDtcObservationRecord, upgradeDtcObservation } from '../../core/obd/persistence/upgradeDtcObservation'
import { openObdDatabase } from './migrations'
import { OBD_STORES } from './stores'

const MAX_PERSISTED_SESSIONS = 20

function requestResult<Value>(request: IDBRequest<Value>): Promise<Value> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = transaction.onerror = () => reject(transaction.error)
  })
}

export class IndexedDbAdapter implements
  ObdSessionRepository,
  DtcRepository,
  DiagnosticAssessmentRepository,
  MaintenanceRepository,
  SyncQueueRepository,
  SupportedPidCacheRepository {
  private readonly database: Promise<IDBDatabase>

  constructor(factory?: IDBFactory) {
    const resolvedFactory = factory
      ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB)
    if (!resolvedFactory) {
      throw new Error('IndexedDB is not available in this environment')
    }
    this.database = openObdDatabase(resolvedFactory)
  }

  async startSession(session: PersistedObdSessionRecord): Promise<void> {
    const database = await this.database
    const transaction = database.transaction(
      [OBD_STORES.sessions, OBD_STORES.events, OBD_STORES.assessments],
      'readwrite'
    )
    const sessions = transaction.objectStore(OBD_STORES.sessions)
    sessions.put(session)
    this.evictExpiredSessions(
      sessions,
      transaction.objectStore(OBD_STORES.events),
      transaction.objectStore(OBD_STORES.assessments)
    )
    await transactionDone(transaction)
  }

  async updateSession(session: PersistedObdSessionRecord): Promise<void> {
    await this.writeStore(OBD_STORES.sessions, store => store.put(session))
  }

  async appendEvents(events: PersistedObdSessionEventRecord[]): Promise<void> {
    await this.writeStore(OBD_STORES.events, store => events.forEach(event => store.put(event)))
  }

  async listSessions(): Promise<PersistedObdSessionRecord[]> {
    return this.readStore(OBD_STORES.sessions, store => requestResult(store.getAll()))
  }

  async loadSession(sessionId: string): Promise<{
    session: PersistedObdSessionRecord
    events: PersistedObdSessionEventRecord[]
  } | undefined> {
    const database = await this.database
    const transaction = database.transaction([OBD_STORES.sessions, OBD_STORES.events])
    const sessions = transaction.objectStore(OBD_STORES.sessions)
    const events = transaction.objectStore(OBD_STORES.events).index('sessionId')
    const [session, persistedEvents] = await Promise.all([
      requestResult(sessions.get(sessionId)),
      requestResult(events.getAll(sessionId))
    ])

    return session && { session, events: persistedEvents }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const database = await this.database
    const transaction = database.transaction(
      [OBD_STORES.sessions, OBD_STORES.events, OBD_STORES.assessments],
      'readwrite'
    )
    transaction.objectStore(OBD_STORES.sessions).delete(sessionId)
    this.deleteSessionEvents(transaction.objectStore(OBD_STORES.events), sessionId)
    this.deleteByIndex(
      transaction.objectStore(OBD_STORES.assessments),
      'sessionId',
      sessionId
    )
    await transactionDone(transaction)
  }

  async recordObservations(observations: PersistedDtcObservationRecord[]): Promise<void> {
    await this.writeStore(OBD_STORES.observations, store => observations.forEach(item => store.put(item)))
  }

  async listObservations(): Promise<PersistedDtcObservation[]> {
    const rows = await this.readStore(
      OBD_STORES.observations,
      store => requestResult(store.getAll())
    )

    // Validated rather than cast: these rows were written by whatever version
    // of the application ran last, and a shape this build does not recognise
    // must be skipped instead of coerced into a fault code it never was.
    return (Array.isArray(rows) ? rows : [])
      .filter(isPersistedDtcObservationRecord)
      .map(upgradeDtcObservation)
  }

  async deleteObservation(id: string): Promise<void> {
    await this.writeStore(OBD_STORES.observations, store => store.delete(id))
  }

  async recordAssessment(assessment: PersistedDiagnosticAssessment): Promise<void> {
    await this.writeStore(OBD_STORES.assessments, store => store.put(assessment))
  }

  async listAssessments(): Promise<PersistedDiagnosticAssessment[]> {
    return this.readStore(
      OBD_STORES.assessments,
      store => requestResult(store.getAll())
    )
  }

  async deleteAssessment(id: string): Promise<void> {
    await this.writeStore(OBD_STORES.assessments, store => store.delete(id))
  }

  async saveMaintenanceRecord(record: PersistedMaintenanceRecord): Promise<void> {
    await this.writeStore(OBD_STORES.maintenance, store => store.put(record))
  }

  async listMaintenanceRecords(): Promise<PersistedMaintenanceRecord[]> {
    return this.readStore(
      OBD_STORES.maintenance,
      store => requestResult(store.getAll())
    )
  }

  async deleteMaintenanceRecord(id: string): Promise<void> {
    await this.writeStore(OBD_STORES.maintenance, store => store.delete(id))
  }

  async enqueue(operation: SyncOperation): Promise<void> {
    await this.writeStore(OBD_STORES.syncQueue, store => store.put(operation))
  }

  async listPendingOperations(): Promise<SyncOperation[]> {
    return this.readStore(
      OBD_STORES.syncQueue,
      store => requestResult(
        store.index('enqueuedAt').getAll()
      ) as Promise<SyncOperation[]>
    )
  }

  async markOperationsSynced(ids: readonly string[]): Promise<void> {
    await this.writeStore(
      OBD_STORES.syncQueue,
      store => ids.forEach(id => store.delete(id))
    )
  }

  async recordOperationFailure(ids: readonly string[]): Promise<void> {
    const database = await this.database
    const transaction = database.transaction(OBD_STORES.syncQueue, 'readwrite')
    const store = transaction.objectStore(OBD_STORES.syncQueue)

    for (const id of ids) {
      const request = store.get(id)

      request.onsuccess = () => {
        const operation = request.result as SyncOperation | undefined

        // An acknowledgement for something this queue does not hold is
        // ignored rather than re-created: the row may have been accepted and
        // removed by an earlier drain.
        if (!operation) return

        store.put({ ...operation, attempts: operation.attempts + 1 })
      }
    }

    await transactionDone(transaction)
  }

  async read(fingerprint: string): Promise<PersistedSupportedPidCache | undefined> {
    return this.readStore(OBD_STORES.pidCache, store => requestResult(store.get(fingerprint)))
  }

  async write(cache: PersistedSupportedPidCache): Promise<void> {
    await this.writeStore(OBD_STORES.pidCache, store => store.put(cache))
  }

  private async readStore<Value>(
    name: string,
    operation: (store: IDBObjectStore) => Promise<Value>
  ): Promise<Value> {
    const database = await this.database
    const transaction = database.transaction(name)
    return operation(transaction.objectStore(name))
  }

  private async writeStore(
    name: string,
    operation: (store: IDBObjectStore) => void
  ): Promise<void> {
    const database = await this.database
    const transaction = database.transaction(name, 'readwrite')
    operation(transaction.objectStore(name))
    await transactionDone(transaction)
  }

  private evictExpiredSessions(
    sessions: IDBObjectStore,
    events: IDBObjectStore,
    assessments: IDBObjectStore
  ): void {
    let retained = 0
    const request = sessions.index('startedAt').openCursor(null, 'prev')
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (retained++ >= MAX_PERSISTED_SESSIONS) {
        const sessionId = cursor.value.sessionId as string

        this.deleteSessionEvents(events, sessionId)
        // An evaluation of a session nobody can open any more is unreadable
        // history, so it rolls off with the session rather than accumulating.
        this.deleteByIndex(assessments, 'sessionId', sessionId)
        cursor.delete()
      }
      cursor.continue()
    }
  }

  private deleteSessionEvents(events: IDBObjectStore, sessionId: string): void {
    this.deleteByIndex(events, 'sessionId', sessionId)
  }

  private deleteByIndex(
    store: IDBObjectStore,
    index: string,
    key: string
  ): void {
    const request = store.index(index).openCursor(key)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      cursor.delete()
      cursor.continue()
    }
  }
}
