import { ref } from 'vue'

import type {
  AndroidBleBridge,
  AndroidBleProfile
} from '../../core/bluetooth/AndroidBleBridge'
import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { AndroidBleObdTransport } from '../../core/obd/transport/AndroidBleObdTransport'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Bounded identification probe for a candidate BLE serial pipe.
 *
 * Sends a single ATZ and reports whether the adapter answered. ATZ is answered
 * by the ELM327 chip itself and never reaches the vehicle bus, so this confirms
 * the reviewed UUID triple without any OBD communication. It stays a probe on
 * purpose: no initialization sequence, no PID discovery, no polling.
 */
export function useElmPipeProbe(
  bridge: AndroidBleBridge,
  profile: AndroidBleProfile
) {
  const busy = ref(false)
  const confirmed = ref(false)
  const response = ref('')
  const statusMessage = ref('')
  const errorMessage = ref('')

  async function run(
    timeoutMs = 5000,
    command = 'ATZ'
  ): Promise<void> {
    busy.value = true
    confirmed.value = false
    response.value = ''
    errorMessage.value = ''
    statusMessage.value = 'Conectando con el adaptador…'

    if (!bridge.isSupported()) {
      errorMessage.value
        = 'La sonda BLE solo funciona en la aplicación Android nativa'
      statusMessage.value = ''
      busy.value = false

      return
    }

    const transport = new AndroidBleObdTransport({ bridge, profile })
    const executor = new ElmCommandExecutor(transport)

    try {
      await transport.select()
      await transport.connect()

      statusMessage.value = `Enviando ${command}…`

      const result = await executor.execute(command, timeoutMs)

      response.value = result.normalizedText || result.rawText
      confirmed.value = response.value.trim().length > 0
      statusMessage.value = confirmed.value
        ? 'El adaptador respondió: la tubería BLE es correcta'
        : 'El adaptador no devolvió texto'
    } catch (error) {
      errorMessage.value = toMessage(error)
      statusMessage.value = ''
    } finally {
      // The adapter must never be left connected because a probe failed; a
      // half-open GATT link blocks the next attempt and every other OBD app.
      executor.dispose()

      try {
        await transport.disconnect()
      } catch (error) {
        if (!errorMessage.value) {
          errorMessage.value = toMessage(error)
        }
      }

      busy.value = false
    }
  }

  return {
    busy,
    confirmed,
    response,
    statusMessage,
    errorMessage,
    run
  }
}
