import { computed, ref } from 'vue'

import {
  buildMaintenanceRecord,
  type MaintenanceRecordInput
} from '~~/core/maintenance/buildMaintenanceRecord'
import {
  computeMaintenanceDue
} from '~~/core/maintenance/computeMaintenanceDue'
import type {
  PersistedMaintenanceRecord
} from '~~/core/obd/persistence/ports'
import { maintenanceSyncOperation } from '~~/core/sync/maintenanceSyncOperation'
import type { ObdPersistence } from '~~/data/repositories/createObdPersistence'

/**
 * The owner's service history, and what it projects (RF-036).
 *
 * Unlike everything else the lab stores, none of this comes from the car. It
 * is the one part of the app where the person is the sensor, which is why it
 * survives every session lifecycle: `deleteSession` and the twenty-session
 * eviction never touch these rows.
 *
 * Persistence is optional here for the same reason it is optional in
 * `useObdSessionRecording`: on a platform where the client plugin never ran
 * there is no `$obdPersistence`, and the screen has to render anyway — empty,
 * and saying so.
 *
 * **The store is read from the Nuxt app rather than handed in through props,
 * and that is not a style choice.** A prop travels through Vue's reactivity,
 * which wraps the adapter in a proxy; the in-memory adapter clones rows with
 * `structuredClone`, and a proxy cannot be structured-cloned. The first
 * version of this panel took the store as a prop and every read after a
 * write failed with `DataCloneError` — the row was saved and the screen
 * claimed it could not read the history back. Reading it here keeps the
 * store out of the reactive graph entirely.
 */
export function useMaintenanceRecords() {
  const persistence = import.meta.client
    ? (useNuxtApp() as { $obdPersistence?: ObdPersistence }).$obdPersistence
    : undefined

  const records = ref<PersistedMaintenanceRecord[]>([])
  const errorMessage = ref('')
  const available = computed(() => persistence !== undefined)

  const due = computed(() =>
    computeMaintenanceDue(records.value, { todayMs: Date.now() })
  )

  async function load(): Promise<void> {
    if (!persistence) {
      return
    }

    try {
      records.value = await persistence.listMaintenanceRecords()
      errorMessage.value = ''
    } catch {
      errorMessage.value = 'No pude leer el historial de mantenimiento guardado.'
    }
  }

  /**
   * Saves and reloads, rather than pushing the new row onto the array.
   * Reading the store back is what proves the write landed; trusting the
   * local copy would show the owner a record the device never kept.
   */
  async function save(input: MaintenanceRecordInput): Promise<boolean> {
    const record = buildMaintenanceRecord(input, Date.now())

    if (!record) {
      errorMessage.value
        = 'Revisa la fecha, el kilometraje y qué se hizo antes de guardar.'

      return false
    }

    if (!persistence) {
      errorMessage.value
        = 'Este dispositivo no tiene almacenamiento local disponible.'

      return false
    }

    try {
      await persistence.saveMaintenanceRecord(record)
    } catch {
      errorMessage.value = 'No pude guardar el registro. Inténtalo de nuevo.'

      return false
    }

    try {
      await persistence.enqueue(maintenanceSyncOperation(record.id, Date.now()))
    } catch {
      errorMessage.value
        = 'Guardé el registro localmente, pero no pude dejarlo en cola para sincronizar.'

      await load()

      return false
    }

    await load()

    return true
  }

  return {
    records,
    due,
    available,
    errorMessage,
    load,
    save
  }
}
