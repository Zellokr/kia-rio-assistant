import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  ObdPollScheduler
} from '../../core/obd/polling/ObdPollScheduler'

import type {
  ElmCommandResult
} from '../../core/obd/protocol/ElmCommandExecutor'

function createResult(
  command: string
): ElmCommandResult {
  return {
    command,
    rawText: '41 0C 1A F8\r>',
    normalizedText: '41 0C 1A F8',
    responseKind: 'obd-data',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    latencyMs: 1
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ObdPollScheduler', () => {
  it('polls a task repeatedly', async () => {
    vi.useFakeTimers()

    const execute = vi.fn(
      async (command: string) => {
        return createResult(command)
      }
    )

    const scheduler = new ObdPollScheduler({
      execute
    })

    scheduler.addTask({
      id: 'rpm',
      command: '010C',
      intervalMs: 100
    })

    scheduler.start()

    await vi.advanceTimersByTimeAsync(350)

    scheduler.stop()

    expect(execute).toHaveBeenCalled()

    expect(execute).toHaveBeenCalledWith(
      '010C',
      3000
    )

    expect(
      execute.mock.calls.length
    ).toBeGreaterThanOrEqual(3)
  })

  it('does not start duplicate loops', async () => {
    vi.useFakeTimers()

    const execute = vi.fn(
      async (command: string) => {
        return createResult(command)
      }
    )

    const scheduler = new ObdPollScheduler({
      execute
    })

    scheduler.addTask({
      id: 'rpm',
      command: '010C',
      intervalMs: 100
    })

    scheduler.start()
    scheduler.start()

    await vi.advanceTimersByTimeAsync(150)

    scheduler.stop()

    expect(
      execute.mock.calls.length
    ).toBeLessThanOrEqual(2)
  })

  it('rejects invalid intervals', () => {
    const scheduler = new ObdPollScheduler({
      execute: async (command: string) =>
        createResult(command)
    })

    expect(() => {
      scheduler.addTask({
        id: 'rpm',
        command: '010C',
        intervalMs: 0
      })
    }).toThrow(
      'Poll interval must be greater than zero'
    )
  })

  it('ignores an in-flight result after stop', async () => {
    let resolveExecution:
      | ((result: ElmCommandResult) => void)
      | undefined

    const execute = vi.fn(
      () => {
        return new Promise<ElmCommandResult>(
          (resolve) => {
            resolveExecution = resolve
          }
        )
      }
    )

    const scheduler = new ObdPollScheduler({
      execute
    })

    const resultListener = vi.fn()

    scheduler.onResult(resultListener)

    scheduler.addTask({
      id: 'rpm',
      command: '010C',
      intervalMs: 100
    })

    scheduler.start()

    // El primer comando debe haberse iniciado,
    // pero todavía no ha terminado.
    expect(execute).toHaveBeenCalledTimes(1)

    expect(execute).toHaveBeenCalledWith(
      '010C',
      3000
    )

    // Detenemos la telemetría mientras
    // el comando todavía está en vuelo.
    scheduler.stop()

    // Ahora hacemos terminar artificialmente
    // el comando que ya había sido enviado.
    resolveExecution?.(
      createResult('010C')
    )

    // Permitimos que continúen las promesas
    // pendientes del scheduler.
    await Promise.resolve()
    await Promise.resolve()

    // Aunque el comando haya terminado,
    // su resultado no debe publicarse porque
    // la telemetría ya fue detenida.
    expect(
      resultListener
    ).not.toHaveBeenCalled()

    expect(
      scheduler.isRunning()
    ).toBe(false)
  })

  it('can start again after being stopped', async () => {
    vi.useFakeTimers()

    const execute = vi.fn(
      async (command: string) => {
        return createResult(command)
      }
    )

    const scheduler = new ObdPollScheduler({
      execute
    })

    scheduler.addTask({
      id: 'rpm',
      command: '010C',
      intervalMs: 100
    })

    scheduler.start()

    await vi.advanceTimersByTimeAsync(50)

    scheduler.stop()

    const callsAfterFirstRun
      = execute.mock.calls.length

    scheduler.start()

    await vi.advanceTimersByTimeAsync(50)

    scheduler.stop()

    expect(
      execute.mock.calls.length
    ).toBeGreaterThan(callsAfterFirstRun)
  })
})
