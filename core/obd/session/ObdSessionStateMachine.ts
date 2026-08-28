export type ObdSessionState
  = | 'idle'
    | 'selecting'
    | 'selected'
    | 'connecting'
    | 'initializing'
    | 'discovering'
    | 'ready'
    | 'reconnecting'
    | 'disconnecting'
    | 'disconnected'
    | 'error'

const transitions: Record<
  ObdSessionState,
  ObdSessionState[]
> = {
  idle: [
    'selecting'
  ],

  selecting: [
    'selected',
    'error'
  ],

  selected: [
    'connecting',
    'selecting',
    'disconnecting',
    'error'
  ],

  connecting: [
    'initializing',
    'error'
  ],

  initializing: [
    'discovering',
    'error'
  ],

  discovering: [
    'ready',
    'error'
  ],

  ready: [
    'disconnecting',
    'reconnecting',
    'error'
  ],

  reconnecting: [
    'initializing',
    'error',
    'disconnecting'
  ],

  disconnecting: [
    'disconnected',
    'error'
  ],

  disconnected: [
    'selecting',
    'connecting'
  ],

  error: [
    'selecting',
    'connecting',
    'disconnecting',
    'disconnected'
  ]
}

/**
 * Every state the machine can be in.
 *
 * Derived from the transition table, not written out beside it, so the two
 * cannot drift apart: adding a state to `transitions` adds it here. The
 * table's keys are the whole union — `Record<ObdSessionState, …>` makes a
 * missing key a build error.
 *
 * Presentation layers iterate this to prove they cover the union at runtime
 * as well as at compile time.
 */
export const OBD_SESSION_STATES = Object.keys(
  transitions
) as readonly ObdSessionState[]

export class ObdSessionStateMachine {
  state: ObdSessionState = 'idle'

  transition(next: ObdSessionState): void {
    const allowed = transitions[this.state]

    if (!allowed.includes(next)) {
      throw new Error(
        `Invalid OBD session transition: ${this.state} -> ${next}`
      )
    }

    this.state = next
  }

  fail(): void {
    this.state = 'error'
  }
}
