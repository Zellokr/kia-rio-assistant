import {
  describe,
  expect,
  it
} from 'vitest'

import {
  ObdTelemetryStore
} from '../../core/obd/telemetry/ObdTelemetryStore'

import type {
  ElmCommandResult
} from '../../core/obd/protocol/ElmCommandExecutor'

function createResult(
  command: string,
  normalizedText: string
): ElmCommandResult {
  return {
    command,
    rawText: `${normalizedText}\r>`,
    normalizedText,
    responseKind: 'obd-data',
    startedAt: '2026-08-07T10:00:00.000Z',
    completedAt: '2026-08-07T10:00:00.100Z',
    latencyMs: 100
  }
}

describe('ObdTelemetryStore', () => {
  it('stores an RPM value', () => {
    const store = new ObdTelemetryStore()

    store.update(
      {
        pid: '010C',
        key: 'engineRpm',
        label: 'RPM del motor',
        value: 1726,
        unit: 'rpm'
      },
      createResult(
        '010C',
        '41 0C 1A F8'
      )
    )

    expect(
      store.getMetric('engineRpm')
    ).toMatchObject({
      pid: '010C',
      key: 'engineRpm',
      value: 1726,
      unit: 'rpm',
      latencyMs: 100
    })
  })

  it('stores several metrics', () => {
    const store = new ObdTelemetryStore()

    store.update(
      {
        pid: '010C',
        key: 'engineRpm',
        label: 'RPM del motor',
        value: 1726,
        unit: 'rpm'
      },
      createResult(
        '010C',
        '41 0C 1A F8'
      )
    )

    store.update(
      {
        pid: '0105',
        key: 'coolantTemperature',
        label: 'Temperatura del refrigerante',
        value: 50,
        unit: '°C'
      },
      createResult(
        '0105',
        '41 05 5A'
      )
    )

    const snapshot = store.getSnapshot()

    expect(
      snapshot.values.engineRpm?.value
    ).toBe(1726)

    expect(
      snapshot.values.coolantTemperature?.value
    ).toBe(50)
  })

  it('replaces an old value with the latest value', () => {
    const store = new ObdTelemetryStore()

    const result = createResult(
      '010C',
      '41 0C 1A F8'
    )

    store.update(
      {
        pid: '010C',
        key: 'engineRpm',
        label: 'RPM del motor',
        value: 1726,
        unit: 'rpm'
      },
      result
    )

    store.update(
      {
        pid: '010C',
        key: 'engineRpm',
        label: 'RPM del motor',
        value: 1800,
        unit: 'rpm'
      },
      result
    )

    expect(
      store.getMetric('engineRpm')?.value
    ).toBe(1800)
  })

  it('clears all telemetry', () => {
    const store = new ObdTelemetryStore()

    store.update(
      {
        pid: '010C',
        key: 'engineRpm',
        label: 'RPM del motor',
        value: 1726,
        unit: 'rpm'
      },
      createResult(
        '010C',
        '41 0C 1A F8'
      )
    )

    store.clear()

    expect(
      store.getSnapshot()
    ).toEqual({
      values: {},
      updatedAt: null
    })
  })
})
