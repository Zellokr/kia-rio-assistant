import {
  describe,
  expect,
  it
} from 'vitest'

import {
  ObdSessionStateMachine
} from '../../core/obd/session/ObdSessionStateMachine'

describe('ObdSessionStateMachine', () => {
  it('follows the normal OBD session lifecycle', () => {
    const machine = new ObdSessionStateMachine()

    expect(machine.state).toBe('idle')

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('connecting')
    machine.transition('initializing')
    machine.transition('discovering')
    machine.transition('ready')

    expect(machine.state).toBe('ready')

    machine.transition('disconnecting')
    machine.transition('disconnected')

    expect(machine.state).toBe('disconnected')
  })

  it('rejects invalid transitions', () => {
    const machine = new ObdSessionStateMachine()

    expect(() => {
      machine.transition('ready')
    }).toThrow(
      'Invalid OBD session transition: idle -> ready'
    )
  })

  it('can enter the error state', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.fail()

    expect(machine.state).toBe('error')
  })

  it('can recover after an error', () => {
    const machine = new ObdSessionStateMachine()

    machine.fail()

    expect(machine.state).toBe('error')

    machine.transition('selecting')

    expect(machine.state).toBe('selecting')
  })
})
