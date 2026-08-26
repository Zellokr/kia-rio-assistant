import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import type { AndroidBleProfile } from '../../core/bluetooth/AndroidBleBridge'
import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { initializeElm327 } from '../../core/obd/protocol/Elm327Initializer'
import { discoverSupportedPids } from '../../core/obd/protocol/SupportedPidDiscovery'
import { ObdPollScheduler } from '../../core/obd/polling/ObdPollScheduler'
import { MockObdTransport } from '../../core/obd/transport/MockObdTransport'
import {
  ReplayObdTransport
} from '../../core/obd/transport/ReplayObdTransport'
import { AndroidBleObdTransport } from '../../core/obd/transport/AndroidBleObdTransport'
import { FakeAndroidBleBridge } from './support/FakeAndroidBleBridge'

/** Synthetic UUIDs for unit tests only — not VEEPEAK inventory values. */
const SYNTHETIC_PROFILE: AndroidBleProfile = {
  serviceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
  writeCharacteristicUuid: '0000fff2-0000-1000-8000-00805f9b34fb',
  notifyCharacteristicUuid: '0000fff1-0000-1000-8000-00805f9b34fb'
}

async function connectedPhysicalTransport() {
  const bridge = new FakeAndroidBleBridge()
  const transport = new AndroidBleObdTransport({
    bridge,
    profile: SYNTHETIC_PROFILE
  })

  await transport.select()
  await transport.connect()

  return { bridge, transport }
}

/** Emits the queued response for a scripted step so the executor can decode it. */
function respond(bridge: FakeAndroidBleBridge, rawText: string): void {
  bridge.emit(rawText)
}

describe('physical read-only command policy — integration', () => {
  it('allows a whitelisted manual command and writes it to the real bridge', async () => {
    const { bridge, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    const result = executor.execute('0100')

    await waitForWrite(bridge, 1)
    respond(bridge, '41 00 00 00 00 00\r>')

    await expect(result).resolves.toMatchObject({ command: '0100' })
    expect(bridge.writes).toHaveLength(1)

    executor.dispose()
  })

  it('rejects a manual command outside the physical allowlist without touching the real bridge', async () => {
    const { bridge, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0104')).rejects.toThrow(
      /not (allowed|in the allowed)/i
    )

    expect(bridge.writes).toHaveLength(0)

    executor.dispose()
  })

  it('always rejects Mode 04 on the physical transport', async () => {
    const { bridge, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('04')).rejects.toThrow()
    expect(bridge.writes).toHaveLength(0)

    executor.dispose()
  })

  /**
   * Mode 07 (pending) and Mode 0A (permanent) reach the vehicle only because
   * the allowlist was deliberately widened. These mirror the existing Mode 03
   * cases at the transport boundary, so a regression in the policy shows up
   * here and not only in the unit test of the array itself.
   */
  it.each([
    ['07', '47 00 00 00 00 00 00'],
    ['0A', '4A 00 00 00 00 00 00']
  ])(
    'allows the widened DTC read %s through to the real bridge',
    async (command, emptyFrame) => {
      const { bridge, transport } = await connectedPhysicalTransport()
      const executor = new ElmCommandExecutor(transport)

      const result = executor.execute(command)

      await waitForWrite(bridge, 1)
      respond(bridge, `${emptyFrame}\r>`)

      await expect(result).resolves.toMatchObject({ command })
      expect(bridge.writes).toHaveLength(1)
      expect(
        new TextDecoder().decode(bridge.writes[0]!).trim()
      ).toBe(command)

      executor.dispose()
    }
  )

  it.each(['0B', '08', '09'])(
    'still rejects the unapproved mode %s at the transport boundary',
    async (command) => {
      const { bridge, transport } = await connectedPhysicalTransport()
      const executor = new ElmCommandExecutor(transport)

      await expect(executor.execute(command)).rejects.toThrow()
      expect(bridge.writes).toHaveLength(0)

      executor.dispose()
    }
  )

  it('rejects Mode 04 even when a widened DTC read precedes it', async () => {
    const { bridge, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    const allowed = executor.execute('07')

    await waitForWrite(bridge, 1)
    respond(bridge, '47 00 00 00 00 00 00\r>')
    await expect(allowed).resolves.toMatchObject({ command: '07' })

    await expect(executor.execute('04')).rejects.toThrow()
    expect(bridge.writes).toHaveLength(1)

    executor.dispose()
  })

  it('runs the full ELM327 initialization sequence over the physical transport', async () => {
    const { bridge, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    const initPromise = initializeElm327(executor)

    const scripted = [
      'ELM327 v1.5\r>',
      'OK\r>',
      'OK\r>',
      'OK\r>',
      'OK\r>',
      'OK\r>'
    ]

    for (let index = 0; index < scripted.length; index++) {
      await waitForWrite(bridge, index + 1)
      respond(bridge, scripted[index]!)
    }

    const result = await initPromise

    expect(result.initialized).toBe(true)
    expect(bridge.writes.map(bytes =>
      new TextDecoder().decode(bytes).trim()
    )).toEqual([
      'ATZ',
      'ATE0',
      'ATL0',
      'ATS0',
      'ATH0',
      'ATSP0'
    ])

    executor.dispose()
  })

  it('runs supported PID discovery starting from 0100 over the physical transport', async () => {
    const { bridge, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    const discoveryPromise = discoverSupportedPids(executor)

    await waitForWrite(bridge, 1)
    respond(bridge, '41 00 00 00 00 00\r>')

    const discovery = await discoveryPromise

    expect(discovery.ranges).toHaveLength(1)
    expect(discovery.ranges[0]?.command).toBe('0100')
    expect(bridge.writes).toHaveLength(1)

    executor.dispose()
  })

  it('walks into the extended range when the vehicle advertises one', async () => {
    const { bridge, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    const discoveryPromise = discoverSupportedPids(executor)

    await waitForWrite(bridge, 1)
    // PID 20 supported (last data bit set) signals hasNextRange, so discovery
    // continues into 0120. This mirrors the real 2026-08-24 vehicle capture,
    // whose 0100 bitmask 4100BE3EB813 also set PID 20.
    respond(bridge, '41 00 00 00 00 01\r>')

    await waitForWrite(bridge, 2)
    // 0120 answers with no further range, ending the walk.
    respond(bridge, '41 20 00 00 00 00\r>')

    const discovery = await discoveryPromise

    expect(discovery.ranges).toHaveLength(2)
    expect(discovery.ranges[0]?.command).toBe('0100')
    expect(discovery.ranges[0]?.hasNextRange).toBe(true)
    expect(discovery.ranges[1]?.command).toBe('0120')
    expect(bridge.writes).toHaveLength(2)

    executor.dispose()
  })

  it('never sends unauthorized telemetry PIDs during physical polling', async () => {
    const { bridge, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)
    const scheduler = new ObdPollScheduler(executor)

    const errors: Error[] = []

    scheduler.onError((event) => {
      errors.push(event.error)
    })

    scheduler.addTask({
      id: 'engine-load',
      command: '0104',
      intervalMs: 50
    })
    scheduler.addTask({
      id: 'vehicle-speed',
      command: '010D',
      intervalMs: 50
    })
    scheduler.addTask({
      id: 'throttle-position',
      command: '0111',
      intervalMs: 50
    })

    scheduler.start()

    await vi.waitFor(() => {
      expect(errors.length).toBeGreaterThanOrEqual(3)
    }, { timeout: 5000 })

    scheduler.stop()

    expect(bridge.writes).toHaveLength(0)
    expect(
      errors.every(error => error.message.length > 0)
    ).toBe(true)

    executor.dispose()
  })

  it('recovers after a rejection: a later whitelisted command still succeeds', async () => {
    const { bridge, transport } = await connectedPhysicalTransport()
    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0104')).rejects.toThrow()
    expect(bridge.writes).toHaveLength(0)
    expect(transport.state).toBe('connected')

    const result = executor.execute('ATZ')

    await waitForWrite(bridge, 1)
    respond(bridge, 'ELM327 v1.5\r>')

    await expect(result).resolves.toMatchObject({ command: 'ATZ' })
    expect(bridge.writes).toHaveLength(1)

    executor.dispose()
  })

  it('does not restrict MockObdTransport telemetry PIDs used for simulated testing', async () => {
    const transport = new MockObdTransport()

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0104')).resolves.toMatchObject({
      command: '0104'
    })
    await expect(executor.execute('010D')).resolves.toMatchObject({
      command: '010D'
    })
    await expect(executor.execute('0111')).resolves.toMatchObject({
      command: '0111'
    })

    executor.dispose()
  })

  it('does not restrict ReplayObdTransport telemetry PIDs used for fixture testing', async () => {
    const sessionExport = {
      schemaVersion: 1,
      sessionId: 'replay-1',
      retention: { complete: true },
      transport: { kind: 'mock', name: 'Recorded adapter' },
      events: [
        {
          type: 'tx',
          sequence: 1,
          elapsedMs: 0,
          commandId: 'command-1',
          command: '0104'
        },
        {
          type: 'rx-frame',
          sequence: 2,
          elapsedMs: 5,
          commandId: 'command-1',
          rawText: '41 04 50\r>'
        }
      ]
    }

    const transport = new ReplayObdTransport(sessionExport, { timingScale: 0 })

    await transport.select()
    await transport.connect()

    const executor = new ElmCommandExecutor(transport)

    await expect(executor.execute('0104')).resolves.toMatchObject({
      command: '0104'
    })

    executor.dispose()
  })
})

function waitForWrite(
  bridge: FakeAndroidBleBridge,
  expectedCount: number
): Promise<void> {
  return vi.waitFor(() => {
    expect(bridge.writes.length).toBeGreaterThanOrEqual(expectedCount)
  })
}
