import type {
  DecodedPidValue
} from '../decoder/decodeMode01Response'

import type {
  ElmCommandResult
} from '../protocol/ElmCommandExecutor'

export interface ObdTelemetryMetric {
  key: string
  pid: string
  label: string
  value: number
  unit: string
  updatedAt: string
  latencyMs: number
}

export interface ObdTelemetrySnapshot {
  values: Record<string, ObdTelemetryMetric>
  updatedAt: string | null
}

export class ObdTelemetryStore {
  private readonly metrics = new Map<
    string,
    ObdTelemetryMetric
  >()

  private updatedAt: string | null = null

  update(
    decoded: DecodedPidValue,
    result: ElmCommandResult
  ): ObdTelemetryMetric {
    const metric: ObdTelemetryMetric = {
      key: decoded.key,
      pid: decoded.pid,
      label: decoded.label,
      value: decoded.value,
      unit: decoded.unit,
      updatedAt: result.completedAt,
      latencyMs: result.latencyMs
    }

    this.metrics.set(
      decoded.key,
      metric
    )

    this.updatedAt = result.completedAt

    return {
      ...metric
    }
  }

  getMetric(
    key: string
  ): ObdTelemetryMetric | undefined {
    const metric = this.metrics.get(key)

    if (!metric) {
      return undefined
    }

    return {
      ...metric
    }
  }

  getSnapshot(): ObdTelemetrySnapshot {
    return {
      values: Object.fromEntries(
        [...this.metrics.entries()].map(
          ([key, metric]) => [
            key,
            { ...metric }
          ]
        )
      ),
      updatedAt: this.updatedAt
    }
  }

  clear(): void {
    this.metrics.clear()
    this.updatedAt = null
  }
}
