import type {
  SyncOperation,
  SyncQueueRepository,
  SyncTarget
} from './ports'

/**
 * One push at the remote, and the bookkeeping that follows it.
 *
 * Deliberately not a loop. A drain that retried until the queue emptied would
 * spin against an unavailable backend and would decide on its own how long to
 * keep the radio busy in a car; scheduling belongs to whoever knows the app is
 * online and idle, not here. One call, one batch, one honest report.
 */

export const DEFAULT_SYNC_BATCH_SIZE = 25
export const DEFAULT_SYNC_PUSH_TIMEOUT_MS = 15_000

export interface DrainSyncQueueInput {
  readonly queue: SyncQueueRepository
  readonly target: SyncTarget
  readonly batchSize?: number
  /**
   * Upper bound for one remote push. A WebView Convex reconnect can otherwise
   * leave the mutation promise pending forever, which keeps the UI draining.
   */
  readonly pushTimeoutMs?: number
}

export type SyncDrainOutcome = 'empty' | 'drained' | 'failed'

export interface SyncDrainReport {
  readonly outcome: SyncDrainOutcome
  readonly pushed: number
  readonly accepted: number
  /** Left the queue without reaching the remote: their row is gone. */
  readonly dropped: number
  /** Present only when the remote failed outright. */
  readonly message?: string
}

export async function drainSyncQueue(
  input: DrainSyncQueueInput
): Promise<SyncDrainReport> {
  const batch = (await input.queue.listPendingOperations())
    .slice(0, input.batchSize ?? DEFAULT_SYNC_BATCH_SIZE)

  if (batch.length === 0) {
    return { outcome: 'empty', pushed: 0, accepted: 0, dropped: 0 }
  }

  let result

  try {
    result = await withTimeout(
      input.target.push(batch),
      input.pushTimeoutMs ?? DEFAULT_SYNC_PUSH_TIMEOUT_MS
    )
  } catch (error) {
    // T-011. Nothing is removed: the operations are exactly as they were,
    // one attempt older.
    await input.queue.recordOperationFailure(batch.map(item => item.id))

    return {
      outcome: 'failed',
      pushed: batch.length,
      accepted: 0,
      dropped: 0,
      message: describeFailure(error)
    }
  }

  const accepted = acceptedFrom(batch, result.acceptedIds)
  const dropped = acceptedFrom(batch, result.droppedIds ?? [])
    .filter(id => !accepted.includes(id))

  // Both leave the queue: one because the remote holds it now, the other
  // because there is nothing left to send. They are counted apart.
  const settled = [...accepted, ...dropped]

  if (settled.length > 0) {
    await input.queue.markOperationsSynced(settled)
  }

  // Whatever the remote did not claim is still owed, and carries the attempt
  // so a queue that never drains shows it instead of spinning in silence.
  const rejected = batch
    .map(item => item.id)
    .filter(id => !settled.includes(id))

  if (rejected.length > 0) {
    await input.queue.recordOperationFailure(rejected)
  }

  return {
    outcome: 'drained',
    pushed: batch.length,
    accepted: accepted.length,
    dropped: dropped.length
  }
}

/**
 * Only ids that were actually in the batch count, whether the remote called
 * them accepted or dropped. A remote that acknowledges something it was never
 * sent is confused, and acting on that would delete an operation this drain
 * never pushed.
 */
function acceptedFrom(
  batch: readonly SyncOperation[],
  ids: readonly string[]
): string[] {
  const sent = new Set(batch.map(item => item.id))

  return ids.filter(id => sent.has(id))
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return typeof error === 'string'
    ? error
    : 'La sincronización falló sin indicar un motivo'
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise
  }

  let timeout: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('La sincronización excedió el tiempo máximo de espera'))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise])
    .finally(() => {
      if (timeout !== undefined) {
        clearTimeout(timeout)
      }
    })
}
