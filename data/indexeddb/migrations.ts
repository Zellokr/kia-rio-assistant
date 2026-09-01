import {
  createDiagnosticHistoryStores,
  createObdStores,
  createSyncQueueStore
} from './stores'

export const DB_NAME = 'kia-rio-assistant'
export const DB_VERSION = 3

type Migration = (database: IDBDatabase, transaction: IDBTransaction) => void

export const MIGRATIONS: Record<number, Migration> = {
  1: database => createObdStores(database),
  2: database => createDiagnosticHistoryStores(database),
  3: database => createSyncQueueStore(database)
}

export function openObdDatabase(
  factory: IDBFactory = indexedDB
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const transaction = request.transaction
      if (!transaction) throw new Error('Missing IndexedDB upgrade transaction')

      for (let version = event.oldVersion + 1; version <= DB_VERSION; version++) {
        MIGRATIONS[version]?.(request.result, transaction)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
