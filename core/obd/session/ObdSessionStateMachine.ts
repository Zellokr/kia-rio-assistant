export type ObdSessionState
  = | 'idle'
    | 'selecting'
    | 'selected'
    | 'connecting'
    | 'initializing'
    | 'discovering'
    | 'ready'
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
    'error'
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
