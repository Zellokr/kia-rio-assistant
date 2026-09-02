import { computed, onMounted, onScopeDispose, ref } from 'vue'

import { api } from '#convex/api'
import {
  drainSyncQueue,
  type SyncDrainReport
} from '~~/core/sync/drainSyncQueue'
import {
  createConvexSyncTarget
} from '~/services/convexSyncTarget'
import type { ObdPersistence } from '~~/data/repositories/createObdPersistence'

/**
 * Drains the sync queue into Convex (RF-035, §9.5).
 *
 * §9.5 describes exactly when: *"Al recuperar conectividad, Convex procesará
 * la cola pendiente."* So this drains once when the screen opens and again
 * whenever the browser reports the connection back — and at no other time.
 *
 * **It never runs during OBD acquisition.** §6 puts `ConvexSync` outside that
 * critical path and R-09 forbids coupling the OBD core to sync; a drain that
 * fired while commands were in flight would put a network round trip on the
 * same event loop as a 3-second ELM timeout. Nothing here reaches into the
 * session, and the queue it reads was filled by writes that already happened.
 *
 * Failure is reported, never thrown. A drop mid-drain leaves every unaccepted
 * operation exactly where it was — that is T-011, and it is the queue's job,
 * not this composable's.
 *
 * **The store is read here, never handed in through props.** A prop travels
 * through Vue's reactivity, which proxies the adapter, and
 * `listPendingOperations` clones its rows with `structuredClone`, which
 * refuses a proxy. `MaintenancePanel` shipped that bug once already: the row
 * saved and every read back failed with `DataCloneError`.
 */
export function useConvexSync() {
  const persistence = import.meta.client
    ? (useNuxtApp() as { $obdPersistence?: ObdPersistence }).$obdPersistence
    : undefined

  const lastReport = ref<SyncDrainReport | null>(null)
  const pending = ref(0)
  const draining = ref(false)

  const pushSessions = useConvexMutation(api.sync.pushSessions)
  const pushMaintenance = useConvexMutation(api.sync.pushMaintenance)

  async function refreshPending(): Promise<void> {
    if (!persistence) {
      return
    }

    try {
      pending.value = (await persistence.listPendingOperations()).length
    } catch {
      // The count is a courtesy. Failing to read it must not stop a drain.
    }
  }

  async function drain(): Promise<void> {
    if (!persistence || draining.value) {
      return
    }

    draining.value = true

    try {
      lastReport.value = await drainSyncQueue({
        queue: persistence,
        target: createConvexSyncTarget({
          persistence,
          pushSessions: args => pushSessions(args as never),
          pushMaintenance: args => pushMaintenance(args as never)
        })
      })
    } catch (error) {
      // drainSyncQueue already turns a failing target into a report; reaching
      // here means the queue itself could not be read or written.
      lastReport.value = {
        outcome: 'failed',
        pushed: 0,
        accepted: 0,
        dropped: 0,
        message: error instanceof Error ? error.message : 'error desconocido'
      }
    } finally {
      draining.value = false
      await refreshPending()
    }
  }

  function drainWhenOnline(): void {
    void drain()
  }

  onMounted(() => {
    void refreshPending()

    if (globalThis.navigator?.onLine !== false) {
      void drain()
    }

    globalThis.addEventListener?.('online', drainWhenOnline)
  })

  onScopeDispose(() => {
    globalThis.removeEventListener?.('online', drainWhenOnline)
  })

  return {
    available: computed(() => persistence !== undefined),
    pending,
    draining,
    lastReport,
    drain
  }
}
