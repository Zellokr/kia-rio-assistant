import type {
  ObdSessionState
} from '~~/core/obd/session/ObdSessionStateMachine'

/**
 * The session state, shared with whatever renders outside the page.
 *
 * The header lives in `layouts/default.vue` and the session in the page, so
 * the header cannot reach it: a layout renders around a page, not inside
 * it. This is the one cell that crosses that boundary — the page publishes
 * the state it already owns, and the header reads it.
 *
 * `useState` on purpose, and not in contradiction of removing it from
 * `useObdTelemetry`. That one had a single consumer inside one component
 * tree and never crossed a boundary, so a keyed global bought nothing. This
 * exists precisely to cross one, which is what the primitive is for.
 *
 * Deliberately just the state. Anything richer would put a second copy of
 * the session's logic outside the composable that owns it.
 */
export function useSessionStateBeacon() {
  return useState<ObdSessionState>('obd-session-state', () => 'idle')
}
