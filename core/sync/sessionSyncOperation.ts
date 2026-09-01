import type { SyncOperation } from './ports'

/**
 * The queue entry for one driving session.
 *
 * The id is derived from the session id and nothing else, which is what makes
 * §15.2's *"reintenta sin duplicar datos"* structural: the queue writes by
 * id, so a session offered again — because it reconnected, because it ended,
 * because the app was killed and reopened — stays one pending operation
 * instead of accumulating one per event.
 *
 * The operation carries a **reference**, not a snapshot. A sync client reads
 * the session row at push time, so an entry queued while the session was
 * still running syncs whatever the row says when it finally travels. That is
 * why re-queuing is cheap and why nothing has to be re-serialised when the
 * session changes.
 */
export function sessionSyncOperation(
  sessionId: string,
  nowMs: number
): SyncOperation {
  return {
    schemaVersion: 1,
    id: `session:${sessionId}`,
    kind: 'session',
    recordId: sessionId,
    enqueuedAt: new Date(nowMs).toISOString(),
    attempts: 0
  }
}
