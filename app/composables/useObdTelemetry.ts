import { computed, ref } from 'vue'

import type {
  ObdTelemetryMetric,
  ObdTelemetrySnapshot
} from '~~/core/obd/telemetry/ObdTelemetryStore'

/**
 * The five readings the lab puts on screen, named.
 *
 * `ObdTelemetrySnapshot.values` is a `Record<string, ...>` because the store
 * holds whatever PIDs the vehicle answered. That is right for the store and
 * wrong for a view, which needs to know at compile time that
 * `coolantTemperature` is a thing it can render.
 */
export interface ObdTelemetryMetrics {
  engineRpm: ObdTelemetryMetric | undefined
  vehicleSpeed: ObdTelemetryMetric | undefined
  coolantTemperature: ObdTelemetryMetric | undefined
  engineLoad: ObdTelemetryMetric | undefined
  throttlePosition: ObdTelemetryMetric | undefined
}

function emptySnapshot(): ObdTelemetrySnapshot {
  return {
    values: {},
    updatedAt: null
  }
}

/**
 * The reactive mirror of `ObdTelemetryStore`.
 *
 * This used to hold its snapshot in Nuxt's `useState`, which is the
 * primitive for state that has to survive the SSR boundary inside the
 * payload. Nothing here crosses that boundary: telemetry exists only on the
 * client, arrives only from a live adapter, and the route it feeds is
 * prerendered. `useState` bought a global key and payload serialisation for
 * a value that could never be in the payload; a plain `ref` says what is
 * actually true.
 *
 * A consequence worth naming: each call now owns its own state instead of
 * sharing one keyed cell. `useObdLabSession` is the only caller, and a
 * second session that silently inherited the first one's readings would be
 * a worse default than one that starts empty.
 */
export function useObdTelemetry() {
  const snapshot = ref<ObdTelemetrySnapshot>(emptySnapshot())

  const metrics = computed<ObdTelemetryMetrics>(() => {
    const values = snapshot.value.values

    return {
      engineRpm: values.engineRpm,
      vehicleSpeed: values.vehicleSpeed,
      coolantTemperature: values.coolantTemperature,
      engineLoad: values.engineLoad,
      throttlePosition: values.throttlePosition
    }
  })

  function setSnapshot(next: ObdTelemetrySnapshot): void {
    snapshot.value = next
  }

  function clear(): void {
    snapshot.value = emptySnapshot()
  }

  return {
    snapshot,
    metrics,
    setSnapshot,
    clear
  }
}
