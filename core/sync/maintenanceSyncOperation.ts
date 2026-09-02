import type { SyncOperation } from './ports'

/**
 * The queue entry for one owner-entered maintenance record.
 *
 * Like sessions, this is a reference rather than a snapshot: the sync target
 * reads the maintenance row when the operation is pushed. The operation id is
 * derived from the local record id, making re-enqueueing the same saved service
 * idempotent across retries.
 */
export function maintenanceSyncOperation(
  recordId: string,
  nowMs: number
): SyncOperation {
  return {
    schemaVersion: 1,
    id: `maintenance:${recordId}`,
    kind: 'maintenance',
    recordId,
    enqueuedAt: new Date(nowMs).toISOString(),
    attempts: 0
  }
}
