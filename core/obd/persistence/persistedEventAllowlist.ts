import type {
  ObdSessionEvent
} from '../logging/ObdSessionLog'

export type PersistableObdSessionEvent = Extract<
  ObdSessionEvent,
  { type: 'session-state' | 'telemetry-state' | 'activity' | 'capability-discovery' | 'error' }
> | (Omit<Extract<ObdSessionEvent, { type: 'decoded-value' }>, 'source'> & {
  source: 'manual'
})

/**
 * A failure to write is not itself written.
 *
 * Persistence failures are reported as `error` events so a human reading the
 * session log can see the gap, and that report reaches the recorder like any
 * other event. Storing it would close a cycle: a rejected flush raises an
 * error event, which is queued, which is flushed, which is rejected. The
 * buffer never drains while the store is broken and each round adds another
 * event to it.
 *
 * So the report goes to the log and stops there. The exported session still
 * carries it — `getExport` reads the in-memory log, not the store.
 */
export function isPersistableEvent(
  event: ObdSessionEvent
): event is PersistableObdSessionEvent {
  if (event.type === 'error') {
    return event.error.phase !== 'persistence'
  }

  return event.type === 'session-state'
    || event.type === 'telemetry-state'
    || event.type === 'activity'
    || event.type === 'capability-discovery'
    || (event.type === 'decoded-value' && event.source === 'manual')
}
