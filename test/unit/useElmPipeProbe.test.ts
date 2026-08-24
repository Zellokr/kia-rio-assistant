import { describe, expect, it, vi } from 'vitest'

import type {
  AndroidBleBridge,
  AndroidBleConnectOptions,
  AndroidBleDevice,
  AndroidBleProfile
} from '../../core/bluetooth/AndroidBleBridge'
import { useElmPipeProbe } from '../../app/composables/useElmPipeProbe'

const PROFILE: AndroidBleProfile = {
  serviceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
  writeCharacteristicUuid: '0000fff2-0000-1000-8000-00805f9b34fb',
  notifyCharacteristicUuid: '0000fff1-0000-1000-8000-00805f9b34fb'
}

class FakeBridge implements AndroidBleBridge {
  supported = true

  connectOptions: AndroidBleConnectOptions | undefined

  written: string[] = []

  disconnected = 0

  /** Bytes the fake adapter answers with, or undefined to stay silent. */
  reply: string | undefined = 'ELM327 v1.5\r\r>'

  private listener: ((data: Uint8Array) => void) | undefined

  isSupported(): boolean {
    return this.supported
  }

  async requestDevice(): Promise<AndroidBleDevice> {
    return { id: 'ble-1', name: 'VEEPEAK' }
  }

  async connect(options: AndroidBleConnectOptions): Promise<void> {
    this.connectOptions = options
  }

  async disconnect(): Promise<void> {
    this.disconnected += 1
  }

  async write(data: Uint8Array): Promise<void> {
    this.written.push(new TextDecoder().decode(data))

    if (this.reply !== undefined) {
      const reply = this.reply
      queueMicrotask(() => {
        this.listener?.(new TextEncoder().encode(reply))
      })
    }
  }

  subscribe(listener: (data: Uint8Array) => void): () => void {
    this.listener = listener

    return () => {
      this.listener = undefined
    }
  }
}

describe('useElmPipeProbe', () => {
  it('confirms the pipe when the adapter answers ATZ', async () => {
    const bridge = new FakeBridge()
    const probe = useElmPipeProbe(bridge, PROFILE)

    await probe.run()

    expect(probe.confirmed.value).toBe(true)
    expect(probe.response.value).toContain('ELM327')
    expect(probe.errorMessage.value).toBe('')
  })

  it('connects with the reviewed profile, unmodified', async () => {
    const bridge = new FakeBridge()

    await useElmPipeProbe(bridge, PROFILE).run()

    expect(bridge.connectOptions?.profile).toEqual(PROFILE)
  })

  it('sends ATZ and nothing else', async () => {
    const bridge = new FakeBridge()

    await useElmPipeProbe(bridge, PROFILE).run()

    expect(bridge.written).toEqual(['ATZ\r'])
  })

  it('always disconnects, even when the adapter never answers', async () => {
    const bridge = new FakeBridge()
    bridge.reply = undefined
    const probe = useElmPipeProbe(bridge, PROFILE)

    await probe.run(50)

    expect(probe.confirmed.value).toBe(false)
    expect(probe.errorMessage.value).not.toBe('')
    expect(bridge.disconnected).toBe(1)
  })

  it('reports an unsupported platform without touching the bridge', async () => {
    const bridge = new FakeBridge()
    bridge.supported = false
    const requestDevice = vi.spyOn(bridge, 'requestDevice')
    const probe = useElmPipeProbe(bridge, PROFILE)

    await probe.run()

    expect(requestDevice).not.toHaveBeenCalled()
    expect(probe.confirmed.value).toBe(false)
  })

  it('refuses a command the read-only policy does not allow', async () => {
    const bridge = new FakeBridge()
    const probe = useElmPipeProbe(bridge, PROFILE)

    // ATI is a plausible identification command that the policy allowlist
    // deliberately excludes; the probe must not smuggle it past the boundary.
    await probe.run(500, 'ATI')

    expect(probe.confirmed.value).toBe(false)
    expect(bridge.written).toEqual([])
    expect(bridge.disconnected).toBe(1)
  })
})
