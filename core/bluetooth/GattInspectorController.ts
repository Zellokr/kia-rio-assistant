export interface GattDevice {
  id: string
  name?: string
  rssi?: number
}

export interface GattCharacteristicProperties {
  read: boolean
  write: boolean
  writeWithoutResponse: boolean
  notify: boolean
  indicate: boolean
}

export interface GattDescriptorInventory {
  uuid: string
}

export interface GattCharacteristicInventory {
  uuid: string
  properties: GattCharacteristicProperties
  descriptors: GattDescriptorInventory[]
}

export interface GattServiceInventory {
  uuid: string
  characteristics: GattCharacteristicInventory[]
}

export interface GattInventory {
  device: GattDevice
  services: GattServiceInventory[]
}

export interface GattInspectorBridge {
  isSupported(): boolean
  scan(): Promise<GattDevice[]>
  inspect(options: { deviceId: string }): Promise<GattInventory>
  disconnect(): Promise<void>
}

export interface GattInspectorSnapshot {
  supported: boolean
  devices: GattDevice[]
  selectedDevice?: GattDevice
  inventory?: GattInventory
}

const unsupportedMessage
  = 'GATT inspection is available only in the Capacitor Android app'

export class GattInspectorController {
  private devices: GattDevice[] = []

  private selectedDevice?: GattDevice

  private inventory?: GattInventory

  constructor(private readonly bridge: GattInspectorBridge) {}

  get snapshot(): GattInspectorSnapshot {
    return {
      supported: this.bridge.isSupported(),
      devices: [...this.devices],
      selectedDevice: this.selectedDevice,
      inventory: this.inventory
    }
  }

  async scan(): Promise<GattDevice[]> {
    this.assertSupported()
    await this.disconnect()

    this.devices = await this.bridge.scan()

    return [...this.devices]
  }

  async inspect(deviceId: string): Promise<GattInventory> {
    this.assertSupported()

    const device = this.devices.find(candidate => candidate.id === deviceId)

    if (!device) {
      throw new Error('Select a device from the latest scan')
    }

    this.selectedDevice = device
    this.inventory = await this.bridge.inspect({ deviceId })

    return this.inventory
  }

  async disconnect(): Promise<void> {
    if (this.bridge.isSupported()) {
      await this.bridge.disconnect()
    }

    this.selectedDevice = undefined
    this.inventory = undefined
  }

  private assertSupported(): void {
    if (!this.bridge.isSupported()) {
      throw new Error(unsupportedMessage)
    }
  }
}
