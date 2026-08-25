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

  it('rejects a double connect started before the first reaches ready', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('connecting')

    expect(() => {
      machine.transition('connecting')
    }).toThrow(
      'Invalid OBD session transition: connecting -> connecting'
    )
  })

  it('rejects reconnecting from ready without disconnecting first', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('connecting')
    machine.transition('initializing')
    machine.transition('discovering')
    machine.transition('ready')

    expect(() => {
      machine.transition('connecting')
    }).toThrow(
      'Invalid OBD session transition: ready -> connecting'
    )
  })

  it('allows disconnecting a selected adapter before a connection begins', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('disconnecting')
    machine.transition('disconnected')

    expect(machine.state).toBe('disconnected')
  })

  it('allows reconnecting straight from disconnected without reselecting', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('disconnecting')
    machine.transition('disconnected')
    machine.transition('connecting')

    expect(machine.state).toBe('connecting')
  })

  it('allows entering reconnecting from ready', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('connecting')
    machine.transition('initializing')
    machine.transition('discovering')
    machine.transition('ready')
    machine.transition('reconnecting')

    expect(machine.state).toBe('reconnecting')
  })

  it('allows a recovered reconnect to resume the init sequence', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('connecting')
    machine.transition('initializing')
    machine.transition('discovering')
    machine.transition('ready')
    machine.transition('reconnecting')
    machine.transition('initializing')

    expect(machine.state).toBe('initializing')
  })

  it('allows a reconnect attempt budget to be exhausted into error', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('connecting')
    machine.transition('initializing')
    machine.transition('discovering')
    machine.transition('ready')
    machine.transition('reconnecting')
    machine.transition('error')

    expect(machine.state).toBe('error')
  })

  it('allows disconnecting while a reconnect is in flight', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('connecting')
    machine.transition('initializing')
    machine.transition('discovering')
    machine.transition('ready')
    machine.transition('reconnecting')
    machine.transition('disconnecting')

    expect(machine.state).toBe('disconnecting')
  })

  it('rejects entering reconnecting from idle', () => {
    const machine = new ObdSessionStateMachine()

    expect(() => {
      machine.transition('reconnecting')
    }).toThrow(
      'Invalid OBD session transition: idle -> reconnecting'
    )
  })

  it('rejects a reconnecting self-transition', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('connecting')
    machine.transition('initializing')
    machine.transition('discovering')
    machine.transition('ready')
    machine.transition('reconnecting')

    expect(() => {
      machine.transition('reconnecting')
    }).toThrow(
      'Invalid OBD session transition: reconnecting -> reconnecting'
    )
  })

  it('rejects reconnecting routing back through discovering', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('connecting')
    machine.transition('initializing')
    machine.transition('discovering')
    machine.transition('ready')
    machine.transition('reconnecting')

    expect(() => {
      machine.transition('discovering')
    }).toThrow(
      'Invalid OBD session transition: reconnecting -> discovering'
    )
  })

  it('rejects reconnecting transitioning to connecting', () => {
    const machine = new ObdSessionStateMachine()

    machine.transition('selecting')
    machine.transition('selected')
    machine.transition('connecting')
    machine.transition('initializing')
    machine.transition('discovering')
    machine.transition('ready')
    machine.transition('reconnecting')

    expect(() => {
      machine.transition('connecting')
    }).toThrow(
      'Invalid OBD session transition: reconnecting -> connecting'
    )
  })
})
