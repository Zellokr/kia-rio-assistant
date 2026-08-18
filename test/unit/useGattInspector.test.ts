import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useGattInspector } from '../../app/composables/useGattInspector'
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

describe('useGattInspector', () => {
  it('reports supported as false and skips the adapter when unavailable', () => {
    const bridge = createBridge(false)
    const gatt = useGattInspector(bridge)

    expect(gatt.supported).toBe(false)
    expect(bridge.scan).not.toHaveBeenCalled()
  })

  it('scans for devices and reports how many were found', async () => {
    const bridge = createBridge()
    const gatt = useGattInspector(bridge)

    await gatt.scan()

    expect(gatt.devices.value).toHaveLength(2)
    expect(gatt.devices.value[0]?.id).toBe('AA:BB:CC:DD:EE:FF')
    expect(gatt.statusMessage.value).toBe(
      '2 dispositivo(s) VEEPEAK encontrado(s)'
    )
    expect(gatt.busy.value).toBe(false)
  })

  it('inspects the selected device and exposes the resulting inventory', async () => {
    const bridge = createBridge()
    const gatt = useGattInspector(bridge)

    await gatt.scan()
    gatt.selectedDeviceId.value = 'AA:BB:CC:DD:EE:FF'

    await gatt.inspect()

    expect(bridge.inspect).toHaveBeenCalledWith({
      deviceId: 'AA:BB:CC:DD:EE:FF'
    })
    expect(gatt.inventory.value).toEqual(inventory)
    expect(gatt.selectedDevice.value?.name).toBe('VEEPEAK')
  })

  it('captures adapter errors into errorMessage without throwing', async () => {
    const bridge = createBridge()

    bridge.scan.mockRejectedValueOnce(new Error('BLE scan timed out'))

    const gatt = useGattInspector(bridge)

    await expect(gatt.scan()).resolves.toBeUndefined()

    expect(gatt.errorMessage.value).toBe('BLE scan timed out')
    expect(gatt.statusMessage.value).toBe('')
    expect(gatt.busy.value).toBe(false)
  })

  it('disconnects and clears the selected device and inventory', async () => {
    const bridge = createBridge()
    const gatt = useGattInspector(bridge)

    await gatt.scan()
    gatt.selectedDeviceId.value = 'AA:BB:CC:DD:EE:FF'
    await gatt.inspect()
    bridge.disconnect.mockClear()

    await gatt.disconnect()

    expect(bridge.disconnect).toHaveBeenCalledOnce()
    expect(gatt.selectedDeviceId.value).toBe('')
    expect(gatt.inventory.value).toBeUndefined()
  })

  it('disconnects the underlying controller when the owning scope is disposed', () => {
    const bridge = createBridge()
    const scope = effectScope()

    scope.run(() => {
      useGattInspector(bridge)
    })

    expect(bridge.disconnect).not.toHaveBeenCalled()

    scope.stop()

    expect(bridge.disconnect).toHaveBeenCalledOnce()
  })
})
