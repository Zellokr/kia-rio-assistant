import type {
  PersistedMaintenanceRecord,
  PersistedObdSessionRecord
} from '~~/core/obd/persistence/ports'
import type {
  SyncOperation,
  SyncPushResult,
  SyncTarget
} from '~~/core/sync/ports'
import type { ObdPersistence } from '~~/data/repositories/createObdPersistence'

/**
 * The Convex end of the sync seam (RF-035).
 *
 * `SyncTarget` is the port this implements, and per §6 and R-09 the OBD core
 * never learns it exists — *"ConvexSync no participa en el camino crítico de
 * adquisición OBD"*. Swapping Convex for anything else is swapping this file.
 *
 * The queue holds **references**, so this is where a reference becomes a row:
 * the record is read at push time, and what travels is what the store says
 * then, not what it said when the operation was queued. A session that
 * reconnected twice more since being queued syncs with both reconnections.
 *
 * The mutation is injected rather than imported so this file can be tested
 * without a deployment. In the app it is `useConvexMutation`'s caller passing
 * `api.sync.pushSessions` and `api.sync.pushMaintenance`.
 */

/**
 * One Convex mutation, already bound to its function reference.
 *
 * `useConvexMutation(api.sync.pushSessions)` returns exactly this shape — a
 * callable taking the arguments — so the app passes its two callers straight
 * in and a test passes two spies.
 */
export interface ConvexSyncMutation {
  (args: Record<string, unknown>): Promise<unknown>
}

export interface ConvexSyncTargetOptions {
  readonly persistence: ObdPersistence
  readonly pushSessions: ConvexSyncMutation
  readonly pushMaintenance: ConvexSyncMutation
}

export function createConvexSyncTarget(
  options: ConvexSyncTargetOptions
): SyncTarget {
  return {
    async push(operations: readonly SyncOperation[]): Promise<SyncPushResult> {
      const sessions = await resolveSessions(options, operations)
      const maintenance = await resolveMaintenance(options, operations)

      const accepted: string[] = []

      if (sessions.rows.length > 0) {
        accepted.push(...operationIdsForAcceptedLocalIds(
          sessions,
          await send(options.pushSessions, { sessions: sessions.rows })
        ))
      }

      if (maintenance.rows.length > 0) {
        accepted.push(...operationIdsForAcceptedLocalIds(
          maintenance,
          await send(options.pushMaintenance, { records: maintenance.rows })
        ))
      }

      return {
        acceptedIds: accepted,
        droppedIds: [...sessions.missing, ...maintenance.missing]
      }
    }
  }
}

/**
 * Convex answers with the `localId`s it committed. Only those count: a
 * backend that committed nothing returns an empty list, and reading that
 * silence as success would delete the driver's only copy.
 */
async function send(
  mutation: ConvexSyncMutation,
  args: Record<string, unknown>
): Promise<string[]> {
  const answered = await mutation(args)

  return Array.isArray(answered)
    ? answered.filter((id): id is string => typeof id === 'string')
    : []
}

interface Resolved<Row> {
  readonly rows: Row[]
  /** Maps Convex-returned row localIds back to the queue operation ids. */
  readonly operationIdByLocalId: Map<string, string>
  /** Operations whose row no longer exists, so nothing can be sent for them. */
  readonly missing: string[]
}

async function resolveSessions(
  options: ConvexSyncTargetOptions,
  operations: readonly SyncOperation[]
): Promise<Resolved<Record<string, unknown>>> {
  const wanted = operations.filter(operation => operation.kind === 'session')

  if (wanted.length === 0) {
    return { rows: [], operationIdByLocalId: new Map(), missing: [] }
  }

  const stored = new Map(
    (await options.persistence.listSessions())
      .map(session => [session.sessionId, session])
  )

  return partition(wanted, (operation) => {
    const session = stored.get(operation.recordId)

    return session ? sessionRow(session) : undefined
  })
}

async function resolveMaintenance(
  options: ConvexSyncTargetOptions,
  operations: readonly SyncOperation[]
): Promise<Resolved<Record<string, unknown>>> {
  const wanted = operations.filter(operation => operation.kind === 'maintenance')

  if (wanted.length === 0) {
    return { rows: [], operationIdByLocalId: new Map(), missing: [] }
  }

  const stored = new Map(
    (await options.persistence.listMaintenanceRecords())
      .map(record => [record.id, record])
  )

  return partition(wanted, (operation) => {
    const record = stored.get(operation.recordId)

    return record ? maintenanceRow(record) : undefined
  })
}

function partition(
  operations: readonly SyncOperation[],
  toRow: (operation: SyncOperation) => Record<string, unknown> | undefined
): Resolved<Record<string, unknown>> {
  const rows: Record<string, unknown>[] = []
  const operationIdByLocalId = new Map<string, string>()
  const missing: string[] = []

  for (const operation of operations) {
    const row = toRow(operation)

    if (row) {
      rows.push(row)

      if (typeof row.localId === 'string') {
        operationIdByLocalId.set(row.localId, operation.id)
      }
    } else {
      missing.push(operation.id)
    }
  }

  return { rows, operationIdByLocalId, missing }
}

function operationIdsForAcceptedLocalIds(
  resolved: Resolved<Record<string, unknown>>,
  localIds: readonly string[]
): string[] {
  const operationIds = new Set<string>()

  for (const localId of localIds) {
    const operationId = resolved.operationIdByLocalId.get(localId)

    if (operationId) {
      operationIds.add(operationId)
    }
  }

  return [...operationIds]
}

/**
 * Only the transport's `kind` travels. The rest of `ObdTransportMetadata` is
 * device-local detail a synced history has no use for, and §8.1 keeps this
 * table to what a history needs.
 */
function sessionRow(
  session: PersistedObdSessionRecord
): Record<string, unknown> {
  return {
    schemaVersion: session.schemaVersion,
    localId: session.sessionId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    transportKind: session.transport.kind,
    reconnectCount: session.reconnectCount,
    truncated: session.truncated
  }
}

function maintenanceRow(
  record: PersistedMaintenanceRecord
): Record<string, unknown> {
  return {
    schemaVersion: record.schemaVersion,
    localId: record.id,
    performedAt: record.performedAt,
    odometerKm: record.odometerKm,
    item: record.item,
    notes: record.notes,
    interval: record.interval
  }
}
