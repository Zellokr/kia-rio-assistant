import type {
  ObdSessionEvent
} from '../logging/ObdSessionLog'

export type PersistableObdSessionEvent = Extract<
  ObdSessionEvent,
  { type: 'session-state' | 'telemetry-state' | 'activity' | 'capability-discovery' | 'error' }
> | (Omit<Extract<ObdSessionEvent, { type: 'decoded-value' }>, 'source'> & {
  source: 'manual'
})

export function isPersistableEvent(
  event: ObdSessionEvent
): event is PersistableObdSessionEvent {
  return event.type === 'session-state'
    || event.type === 'telemetry-state'
    || event.type === 'activity'
    || event.type === 'capability-discovery'
    || event.type === 'error'
    || (event.type === 'decoded-value' && event.source === 'manual')
}
