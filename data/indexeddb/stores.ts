export const OBD_STORES = {
  sessions: 'obdSessions',
  events: 'obdSessionEvents',
  observations: 'dtcObservations',
  pidCache: 'supportedPidCache'
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
