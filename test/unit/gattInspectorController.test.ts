import { describe, expect, it, vi } from 'vitest'

import {
  GattInspectorController
} from '../../core/bluetooth/GattInspectorController'
import type {
  GattInspectorBridge,
  GattInventory
} from '../../core/bluetooth/GattInspectorController'

const inventory: GattInventory = {
  device: {
    id: 'AA:BB:CC:DD:EE:FF',
    name: 'VEEPEAK'
  },
  services: [{
    uuid: '0000fff0-0000-1000-8000-00805f9b34fb',
    characteristics: [{
      uuid: '0000fff1-0000-1000-8000-00805f9b34fb',
      properties: {
        read: false,
        write: true,
        writeWithoutResponse: true,
        notify: true,
        indicate: false
      },
      descriptors: [{
        uuid: '00002902-0000-1000-8000-00805f9b34fb'
      }]
    }]
  }]
}

function createBridge(
  supported = true
): GattInspectorBridge & {
  scan: ReturnType<typeof vi.fn>
  inspect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
} {
  return {
    isSupported: () => supported,
    scan: vi.fn().mockResolvedValue([
      { id: 'AA:BB:CC:DD:EE:FF', name: 'VEEPEAK', rssi: -45 },
      { id: '11:22:33:44:55:66', name: 'Other BLE', rssi: -65 }
    ]),
    inspect: vi.fn().mockResolvedValue(inventory),
    disconnect: vi.fn().mockResolvedValue(undefined)
  }
}

describe('GattInspectorController', () => {
  it('reports the feature as unavailable outside Capacitor Android', async () => {
    const bridge = createBridge(false)
    const controller = new GattInspectorController(bridge)

    expect(controller.snapshot.supported).toBe(false)
    await expect(controller.scan()).rejects.toThrow(
      'available only in the Capacitor Android app'
    )
    expect(bridge.scan).not.toHaveBeenCalled()
  })

  it('requires an explicit device from the latest scan before discovery', async () => {
    const bridge = createBridge()
    const controller = new GattInspectorController(bridge)

    await controller.scan()

    await expect(
      controller.inspect('unseen-device')
    ).rejects.toThrow('Select a device from the latest scan')
    expect(bridge.inspect).not.toHaveBeenCalled()

    await expect(
      controller.inspect('AA:BB:CC:DD:EE:FF')
    ).resolves.toEqual(inventory)
    expect(bridge.inspect).toHaveBeenCalledWith({
      deviceId: 'AA:BB:CC:DD:EE:FF'
    })
    expect(controller.snapshot.selectedDevice?.name).toBe('VEEPEAK')
    expect(controller.snapshot.inventory).toEqual(inventory)
  })

  it('disconnects and clears inspection state without performing other BLE operations', async () => {
    const bridge = createBridge()
    const controller = new GattInspectorController(bridge)

    await controller.scan()
    await controller.inspect('AA:BB:CC:DD:EE:FF')
    bridge.disconnect.mockClear()
    await controller.disconnect()

    expect(bridge.disconnect).toHaveBeenCalledOnce()
    expect(controller.snapshot.selectedDevice).toBeUndefined()
    expect(controller.snapshot.inventory).toBeUndefined()
  })
})
