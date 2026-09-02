/**
 * The sync seam (RF-035), with nothing behind it yet.
 *
 * §6 puts `ConvexSync` outside the OBD acquisition critical path — *"No
 * participa en el camino crítico de adquisición OBD"* — and R-09 prescribes
 * the mitigation for the community Nuxt-Convex integration being a moving
 * target: *"Encapsular el cliente de sincronización y evitar acoplar el
 * núcleo OBD."* `SyncTarget` is that encapsulation. A Convex client will
 * implement it; the OBD core never learns it exists.
 */

/**
 * What travels. §5 names sessions and maintenance, and nothing else is
 * eligible: §8.1 forbids Convex receiving high-frequency samples without
 * aggregation, which rules out telemetry and raw session events.
 */
export type SyncOperationKind = 'session' | 'maintenance'

export interface SyncOperation {
  schemaVersion: 1
  /**
   * Idempotency key, stable across retries.
   *
   * §15.2 requires the app to retry *"sin duplicar datos"*. Enqueuing writes
   * by this id, so the same change offered twice is one operation, and a
   * remote that sees the same id twice can recognise the replay.
   */
  id: string
  kind: SyncOperationKind
  /** Identifies the row in its own local store. */
  recordId: string
  enqueuedAt: string
  /** Incremented per push that did not end in acceptance. */
  attempts: number
}

export interface SyncPushResult {
  /**
   * The ids the remote **durably** accepted.
   *
   * Anything absent stays queued. A remote that cannot say what it kept must
   * report an empty list rather than an optimistic one: re-sending an
   * accepted operation is cheap and idempotent, while dropping an unaccepted
   * one loses the driver's data.
   */
  readonly acceptedIds: readonly string[]
  /**
   * Ids that can never be pushed because the row they point at is gone —
   * a session evicted by the twenty-session cap, or a record the owner
   * deleted.
   *
   * They leave the queue like an accepted operation, and they are reported
   * apart from one on purpose: nothing reached the remote, and a count that
   * said otherwise would claim a sync that never happened.
   */
  readonly droppedIds?: readonly string[]
}

export interface SyncTarget {
  push(operations: readonly SyncOperation[]): Promise<SyncPushResult>
}

export interface SyncQueueRepository {
  /** Writes by operation id, so re-enqueuing replaces instead of duplicating. */
  enqueue(operation: SyncOperation): Promise<void>
  /** Oldest first: the remote receives changes in the order they happened. */
  listPendingOperations(): Promise<SyncOperation[]>
  markOperationsSynced(ids: readonly string[]): Promise<void>
  /** Counts a failed attempt. Never discards: T-011 forbids losing data. */
  recordOperationFailure(ids: readonly string[]): Promise<void>
}
