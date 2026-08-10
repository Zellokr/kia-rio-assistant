/**
 * Opaque GATT UUIDs for the future Android BLE OBD byte pipe.
 *
 * Do not hardcode VEEPEAK (or any vendor) UUIDs here. Fill a profile only after
 * a real Step 19 GATT inventory has been captured and reviewed.
 */
export interface AndroidBleProfile {
  serviceUuid: string
  writeCharacteristicUuid: string
  notifyCharacteristicUuid: string
}

export interface AndroidBleDevice {
  id: string
  name?: string
}

export interface AndroidBleConnectOptions {
  deviceId: string
  profile: AndroidBleProfile
}

/**
 * Native Capacitor bridge contract for ELM-over-BLE on Android.
 *
 * Inventory / service discovery stays in GattInspector*. This bridge is only
 * the future byte stream: select device, connect with a reviewed profile,
 * write TX bytes, and push RX notification chunks.
 */
export interface AndroidBleBridge {
  isSupported(): boolean
  requestDevice(): Promise<AndroidBleDevice>
  connect(options: AndroidBleConnectOptions): Promise<void>
  disconnect(): Promise<void>
  write(data: Uint8Array): Promise<void>
  subscribe(
    listener: (data: Uint8Array) => void,
  ): () => void
}

export function assertAndroidBleProfile(
  profile: AndroidBleProfile | undefined
): AndroidBleProfile {
  if (!profile) {
    throw new Error(
      'Android BLE profile UUIDs are required. Capture a VEEPEAK GATT inventory (Step 19) before wiring a real profile; do not invent service or characteristic UUIDs.'
    )
  }

  const fields: Array<keyof AndroidBleProfile> = [
    'serviceUuid',
    'writeCharacteristicUuid',
    'notifyCharacteristicUuid'
  ]

  for (const field of fields) {
    const value = profile[field]?.trim()

    if (!value) {
      throw new Error(
        `Android BLE profile.${field} must be a non-empty UUID string from a reviewed GATT inventory`
      )
    }
  }

  return {
    serviceUuid: profile.serviceUuid.trim(),
    writeCharacteristicUuid: profile.writeCharacteristicUuid.trim(),
    notifyCharacteristicUuid: profile.notifyCharacteristicUuid.trim()
  }
}
