import type {
  DtcRepository,
  ObdSessionRepository,
  PersistedDtcObservation,
  PersistedDtcObservationRecord,
  PersistedObdSessionEventRecord,
  PersistedObdSessionRecord,
  PersistedSupportedPidCache,
  SupportedPidCacheRepository
} from '~~/core/obd/persistence/ports'
import { upgradeDtcObservation } from '../../core/obd/persistence/upgradeDtcObservation'
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
      [OBD_STORES.sessions, OBD_STORES.events],
      'readwrite'
    )
    const sessions = transaction.objectStore(OBD_STORES.sessions)
    sessions.put(session)
    this.evictExpiredSessions(sessions, transaction.objectStore(OBD_STORES.events))
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
      [OBD_STORES.sessions, OBD_STORES.events],
      'readwrite'
    )
    transaction.objectStore(OBD_STORES.sessions).delete(sessionId)
    this.deleteSessionEvents(transaction.objectStore(OBD_STORES.events), sessionId)
    await transactionDone(transaction)
  }

  async recordObservations(observations: PersistedDtcObservationRecord[]): Promise<void> {
    await this.writeStore(OBD_STORES.observations, store => observations.forEach(item => store.put(item)))
  }

  async listObservations(): Promise<PersistedDtcObservation[]> {
    const observations = await this.readStore(
      OBD_STORES.observations,
      store => requestResult(store.getAll())
    ) as PersistedDtcObservationRecord[]

    return observations.map(upgradeDtcObservation)
  }

  async deleteObservation(id: string): Promise<void> {
    await this.writeStore(OBD_STORES.observations, store => store.delete(id))
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
    events: IDBObjectStore
  ): void {
    let retained = 0
    const request = sessions.index('startedAt').openCursor(null, 'prev')
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (retained++ >= MAX_PERSISTED_SESSIONS) {
        this.deleteSessionEvents(events, cursor.value.sessionId as string)
        cursor.delete()
      }
      cursor.continue()
    }
  }

  private deleteSessionEvents(events: IDBObjectStore, sessionId: string): void {
    const request = events.index('sessionId').openCursor(sessionId)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      cursor.delete()
      cursor.continue()
    }
  }
}
