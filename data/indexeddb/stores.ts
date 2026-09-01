export const OBD_STORES = {
  sessions: 'obdSessions',
  events: 'obdSessionEvents',
  observations: 'dtcObservations',
  pidCache: 'supportedPidCache',
  assessments: 'diagnosticAssessments',
  maintenance: 'maintenanceRecords',
  syncQueue: 'syncQueue'
} as const

export function createObdStores(database: IDBDatabase): void {
  const sessions = database.createObjectStore(OBD_STORES.sessions, {
    keyPath: 'sessionId'
  })
  sessions.createIndex('startedAt', 'startedAt')

  const events = database.createObjectStore(OBD_STORES.events, {
    keyPath: 'id',
    autoIncrement: true
  })
  events.createIndex('sessionId', 'sessionId')
  events.createIndex('sessionIdSequence', ['sessionId', 'event.sequence'])

  const observations = database.createObjectStore(OBD_STORES.observations, {
    keyPath: 'id'
  })
  observations.createIndex('sessionId', 'sessionId')
  observations.createIndex('code', 'code')
  observations.createIndex('observedAt', 'observedAt')

  database.createObjectStore(OBD_STORES.pidCache, {
    keyPath: 'fingerprint'
  })
}

/**
 * DB v2: RF-034's evaluations and maintenance.
 *
 * Split from `createObdStores` rather than folded into it, because an existing
 * install arrives here at version 1 with rows already written. The migration
 * runner replays versions in order, so v1 must keep creating exactly what it
 * always created and v2 must add only what is new.
 */
export function createDiagnosticHistoryStores(database: IDBDatabase): void {
  const assessments = database.createObjectStore(OBD_STORES.assessments, {
    keyPath: 'id'
  })
  assessments.createIndex('sessionId', 'sessionId')
  assessments.createIndex('recordedAt', 'recordedAt')

  // Indexed by date because that is the axis a due-date calculation reads
  // (RF-036). Never indexed by session: nothing about a maintenance record
  // belongs to a driving session.
  const maintenance = database.createObjectStore(OBD_STORES.maintenance, {
    keyPath: 'id'
  })
  maintenance.createIndex('performedAt', 'performedAt')
}

/**
 * DB v3: RF-035's queue.
 *
 * §6 makes IndexedDB the mandatory home for the sync queue, so the queue has
 * to survive the app being closed — an app that can *"permanecer offline y
 * sincronizar después"* cannot hold pending work in memory.
 *
 * Indexed by `enqueuedAt` because the remote must receive changes in the
 * order they happened, and the store's own key is the idempotency key rather
 * than an insertion counter.
 */
export function createSyncQueueStore(database: IDBDatabase): void {
  const queue = database.createObjectStore(OBD_STORES.syncQueue, {
    keyPath: 'id'
  })
  queue.createIndex('enqueuedAt', 'enqueuedAt')
}
