import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { ObdSessionLog } from '../../core/obd/logging/ObdSessionLog'
import { PHYSICAL_ALLOWED_COMMANDS } from '../../core/obd/policy/PhysicalObdCommandPolicy'
import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { initializeElm327 } from '../../core/obd/protocol/Elm327Initializer'
import { ObdReconnectionController } from '../../core/obd/session/ObdReconnectionController'
import { ObdSessionStateMachine } from '../../core/obd/session/ObdSessionStateMachine'
import { ReplayObdTransport } from '../../core/obd/transport/ReplayObdTransport'
import { buildReconnectSession } from '../fixtures/obdReplaySessions'

function readLabSource(): string {
  return readFileSync(
    fileURLToPath(new URL(
      '../../app/pages/lab/index.vue',
      import.meta.url
    )),
    'utf8'
  )
}

describe('OBD reconnection wiring', () => {
  it('replays a second initialization without selecting or replacing transport', async () => {
    vi.useFakeTimers()

    const transport = new ReplayObdTransport(
      buildReconnectSession(),
      { timingScale: 0 }
    )
    const commands: string[] = []
    const executor = new ElmCommandExecutor(transport, (event) => {
      if (event.type === 'tx') commands.push(event.command)
    })
    const session = new ObdSessionStateMachine()
    const transitions: string[] = []
    const log = new ObdSessionLog({
      transport: { kind: 'replay' },
      idFactory: () => 'same-session'
    })
    const logChanges: string[] = []

    log.subscribe(change => logChanges.push(change.type))
    log.start({ kind: 'replay' })
    await transport.select()
    await transport.connect()
    await initializeElm327(executor)
    const initialCommandCount = commands.length
    for (const next of [
      'selecting',
      'selected',
      'connecting',
      'initializing',
      'discovering',
      'ready'
    ] as const) {
      session.transition(next)
    }

    const originalTransport = transport
    let attempts = 0
    let commandsAtDiscovery = -1
    const reconnect = new ObdReconnectionController({
      delaysMs: [0],
      onEnter: () => {
        session.transition('reconnecting')
        transitions.push('reconnecting')
        log.record({ type: 'activity', activity: 'reconnect-started' })
      },
      attempt: async () => {
        attempts++
        log.record({ type: 'activity', activity: 'reconnect-attempt' })
        await transport.disconnect()
        await transport.connect()
        await initializeElm327(executor)
      },
      onRecovered: () => {
        session.transition('initializing')
        transitions.push('initializing')
        commandsAtDiscovery = commands.length
        session.transition('discovering')
        transitions.push('discovering')
        session.transition('ready')
        transitions.push('ready')
        log.record({ type: 'activity', activity: 'reconnected' })
      }
    })
    expect(reconnect.notifyLinkSuspect('transport-state')).toBe(true)
    expect(reconnect.notifyLinkSuspect('poll-halt')).toBe(false)
    await vi.runAllTimersAsync()

    expect(attempts).toBe(1)
    expect(transitions).toEqual([
      'reconnecting',
      'initializing',
      'discovering',
      'ready'
    ])
    expect(commandsAtDiscovery).toBe(commands.length)
    expect(transport).toBe(originalTransport)
    expect(log.getExport().sessionId).toBe('same-session')
    expect(logChanges.filter(change => change === 'started')).toHaveLength(1)
    expect(log.getExport().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ activity: 'reconnected' })
    ]))
    const reconnectCommands = commands.slice(initialCommandCount)
    expect(reconnectCommands).toEqual([
      'ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0'
    ])
    expect(reconnectCommands.every(command => (
      PHYSICAL_ALLOWED_COMMANDS.includes(
        command as typeof PHYSICAL_ALLOWED_COMMANDS[number]
      )
    ))).toBe(true)
    expect(reconnectCommands.some(command => command.startsWith('04')))
      .toBe(false)

    executor.dispose()
    vi.useRealTimers()
  })

  it('keeps direct non-ready reconnect entry rejected and aborts before disconnecting', () => {
    const session = new ObdSessionStateMachine()
    const source = readLabSource()
    const disconnectSource = source.slice(
      source.indexOf('async function disconnect()'),
      source.indexOf('async function sendCommand()')
    )

    expect(() => session.transition('reconnecting')).toThrow(
      'Invalid OBD session transition: idle -> reconnecting'
    )
    expect(disconnectSource.indexOf(
      'reconnectionController.abort(\'user-disconnect\')'
    )).toBeLessThan(disconnectSource.indexOf(
      'transitionSession(\'disconnecting\')'
    ))
    expect(source).toContain('new ObdReconnectionController')
    expect(source).toContain('notifyLinkSuspect(\'transport-state\')')
    expect(source).toContain('notifyLinkSuspect(\'poll-halt\')')
    const reconnectSource = source.slice(
      source.indexOf('async function reconnectAttempt()'),
      source.indexOf('const reconnectionController')
    )
    expect(reconnectSource).not.toContain('replaceTransport(')
  })
})
