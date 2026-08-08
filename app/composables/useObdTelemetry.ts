import { computed } from 'vue'

import type {
  ObdTelemetrySnapshot
} from '~~/core/obd/telemetry/ObdTelemetryStore'

export function useObdTelemetry() {
  const snapshot = useState<ObdTelemetrySnapshot>(
    'obd-telemetry',
    () => ({
      values: {},
      updatedAt: null
    })
  )

  const engineRpm = computed(() => {
    return snapshot.value.values.engineRpm
  })

  const coolantTemperature = computed(() => {
    return snapshot.value
      .values.coolantTemperature
  })

  const engineLoad = computed(() => {
    return snapshot.value.values.engineLoad
  })

  const vehicleSpeed = computed(() => {
    return snapshot.value.values.vehicleSpeed
  })

  const throttlePosition = computed(() => {
    return snapshot.value.values.throttlePosition
  })

  function setSnapshot(
    next: ObdTelemetrySnapshot
  ): void {
    snapshot.value = next
  }

  function clear(): void {
    snapshot.value = {
      values: {},
      updatedAt: null
    }
  }

  return {
    snapshot,
    engineRpm,
    coolantTemperature,
    engineLoad,
    vehicleSpeed,
    throttlePosition,
    setSnapshot,
    clear
  }
}
