import type {
  ObdPollTask
} from '../polling/ObdPollScheduler'
import {
  isPhysicalCommandAllowed
} from '../policy/PhysicalObdCommandPolicy'

interface TelemetryPollDefinition {
  pid: string
  task: ObdPollTask
}

const TELEMETRY_POLL_DEFINITIONS: readonly TelemetryPollDefinition[] = [
  {
    pid: '0C',
    task: {
      id: 'engine-rpm',
      command: '010C',
      intervalMs: 1000
    }
  },
  {
    pid: '0D',
    task: {
      id: 'vehicle-speed',
      command: '010D',
      intervalMs: 1000
    }
  },
  {
    pid: '11',
    task: {
      id: 'throttle-position',
      command: '0111',
      intervalMs: 1500
    }
  },
  {
    pid: '04',
    task: {
      id: 'engine-load',
      command: '0104',
      intervalMs: 2000
    }
  },
  {
    pid: '05',
    task: {
      id: 'coolant-temperature',
      command: '0105',
      intervalMs: 3000
    }
  }
]

export interface CreateSupportedTelemetryPollTasksOptions {
  /**
   * Restricts tasks to commands allowed by the physical read-only policy.
   * Must be set for real (non-mock/replay) transports, otherwise polling
   * repeatedly retries commands the transport rejects on every interval.
   */
  physicalOnly?: boolean
}

export function createSupportedTelemetryPollTasks(
  supportedPids: readonly string[],
  options?: CreateSupportedTelemetryPollTasksOptions
): ObdPollTask[] {
  const supported = new Set(supportedPids)

  return TELEMETRY_POLL_DEFINITIONS
    .filter(definition => supported.has(definition.pid))
    .filter(definition =>
      !options?.physicalOnly
      || isPhysicalCommandAllowed(definition.task.command)
    )
    .map(definition => ({
      ...definition.task
    }))
}
