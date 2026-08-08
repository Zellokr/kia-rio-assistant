import {
  describe,
  expect,
  it
} from 'vitest'

import {
  createSupportedTelemetryPollTasks
} from '../../core/obd/telemetry/createSupportedTelemetryPollTasks'

describe('createSupportedTelemetryPollTasks', () => {
  it('creates the five supported telemetry tasks', () => {
    expect(
      createSupportedTelemetryPollTasks([
        '04',
        '05',
        '0C',
        '0D',
        '11'
      ])
    ).toEqual([
      {
        id: 'engine-rpm',
        command: '010C',
        intervalMs: 1000
      },
      {
        id: 'vehicle-speed',
        command: '010D',
        intervalMs: 1000
      },
      {
        id: 'throttle-position',
        command: '0111',
        intervalMs: 1500
      },
      {
        id: 'engine-load',
        command: '0104',
        intervalMs: 2000
      },
      {
        id: 'coolant-temperature',
        command: '0105',
        intervalMs: 3000
      }
    ])
  })

  it('omits telemetry tasks for unsupported PIDs', () => {
    const tasks = createSupportedTelemetryPollTasks([
      '05',
      '0D',
      'FF'
    ])

    expect(
      tasks.map(task => task.command)
    ).toEqual([
      '010D',
      '0105'
    ])
  })

  it('returns no tasks when no telemetry PID is supported', () => {
    expect(
      createSupportedTelemetryPollTasks(['01', '03', 'FF'])
    ).toEqual([])
  })
})
