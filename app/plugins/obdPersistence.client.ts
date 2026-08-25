import { IndexedDbAdapter } from '~~/data/indexeddb/IndexedDbAdapter'
import { createObdPersistence } from '~~/data/repositories/createObdPersistence'

export default defineNuxtPlugin(() => ({
  provide: {
    obdPersistence: createObdPersistence(new IndexedDbAdapter())
  }
}))
