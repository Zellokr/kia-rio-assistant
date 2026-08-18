import {
  computed,
  onScopeDispose,
  ref
} from 'vue'

import { GattInspectorController } from '../../core/bluetooth/GattInspectorController'
import type {
  GattDevice,
  GattInspectorBridge,
  GattInventory
} from '../../core/bluetooth/GattInspectorController'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useGattInspector(adapter: GattInspectorBridge) {
  const controller = new GattInspectorController(adapter)
  const supported = controller.snapshot.supported
  const devices = ref<GattDevice[]>([])
  const selectedDeviceId = ref('')
  const inventory = ref<GattInventory>()
  const busy = ref(false)
  const errorMessage = ref('')
  const statusMessage = ref('')

  const selectedDevice = computed(() => {
    return devices.value.find(
      device => device.id === selectedDeviceId.value
    )
  })

  async function scan(): Promise<void> {
    busy.value = true
    errorMessage.value = ''
    statusMessage.value = 'Escaneando dispositivos VEEPEAK durante 5 segundos…'
    selectedDeviceId.value = ''
    inventory.value = undefined

    try {
      devices.value = await controller.scan()
      statusMessage.value = devices.value.length > 0
        ? `${devices.value.length} dispositivo(s) VEEPEAK encontrado(s)`
        : 'No se encontró ningún dispositivo VEEPEAK'
    } catch (error) {
      errorMessage.value = toMessage(error)
      statusMessage.value = ''
    } finally {
      busy.value = false
    }
  }

  async function inspect(): Promise<void> {
    busy.value = true
    errorMessage.value = ''
    statusMessage.value = 'Conectando y descubriendo servicios GATT…'

    try {
      inventory.value = await controller.inspect(selectedDeviceId.value)
      statusMessage.value = 'Inventario GATT completado. No se enviaron comandos OBD.'
    } catch (error) {
      errorMessage.value = toMessage(error)
      statusMessage.value = ''
    } finally {
      busy.value = false
    }
  }

  async function disconnect(): Promise<void> {
    busy.value = true
    errorMessage.value = ''

    try {
      await controller.disconnect()
      inventory.value = undefined
      selectedDeviceId.value = ''
      statusMessage.value = 'Dispositivo desconectado'
    } catch (error) {
      errorMessage.value = toMessage(error)
    } finally {
      busy.value = false
    }
  }

  onScopeDispose(() => {
    if (supported) void controller.disconnect().catch(() => undefined)
  })

  return {
    supported,
    devices,
    selectedDeviceId,
    selectedDevice,
    inventory,
    busy,
    errorMessage,
    statusMessage,
    scan,
    inspect,
    disconnect
  }
}
