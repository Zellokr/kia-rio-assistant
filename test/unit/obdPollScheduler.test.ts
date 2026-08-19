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

  it('polls forever through errors when no failure limit is set', async () => {
    vi.useFakeTimers()

    const execute = vi.fn(async () => {
      throw new Error('OBD transport is not connected')
    })
    const scheduler = new ObdPollScheduler({ execute })
    const errorListener = vi.fn()

    scheduler.onError(errorListener)
    scheduler.addTask({
      id: 'rpm',
      command: '010C',
      intervalMs: 100
    })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(350)
    scheduler.stop()

    expect(execute.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(errorListener.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('halts itself after the configured number of consecutive failures', async () => {
    vi.useFakeTimers()

    const execute = vi.fn(async () => {
      throw new Error('OBD transport is not connected')
    })
    const scheduler = new ObdPollScheduler(
      { execute },
      { maxConsecutiveErrors: 3 }
    )
    const errorListener = vi.fn()
    const haltListener = vi.fn()

    scheduler.onError(errorListener)
    scheduler.onHalt(haltListener)
    scheduler.addTask({
      id: 'rpm',
      command: '010C',
      intervalMs: 100
    })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(1000)

    expect(execute).toHaveBeenCalledTimes(3)
    expect(errorListener).toHaveBeenCalledTimes(3)
    expect(haltListener).toHaveBeenCalledTimes(1)
    expect(haltListener.mock.calls[0]?.[0]?.error?.message).toBe(
      'OBD transport is not connected'
    )
    expect(scheduler.isRunning()).toBe(false)
  })

  it('resets the failure counter after a successful poll', async () => {
    vi.useFakeTimers()

    const outcomes = ['fail', 'fail', 'ok', 'fail', 'fail', 'fail']
    let call = 0
    const execute = vi.fn(async (command: string) => {
      const outcome = outcomes[call++] ?? 'fail'

      if (outcome === 'ok') {
        return createResult(command)
      }

      throw new Error('OBD transport is not connected')
    })
    const scheduler = new ObdPollScheduler(
      { execute },
      { maxConsecutiveErrors: 3 }
    )
    const haltListener = vi.fn()

    scheduler.onHalt(haltListener)
    scheduler.addTask({
      id: 'rpm',
      command: '010C',
      intervalMs: 100
    })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(2000)

    // The success at index 2 resets the streak, so the halt only fires after
    // the final three consecutive failures: 6 executions total.
    expect(execute).toHaveBeenCalledTimes(6)
    expect(haltListener).toHaveBeenCalledTimes(1)
    expect(scheduler.isRunning()).toBe(false)
  })

  it('rejects an invalid maxConsecutiveErrors option', () => {
    expect(() => {
      return new ObdPollScheduler(
        { execute: async (command: string) => createResult(command) },
        { maxConsecutiveErrors: 0 }
      )
    }).toThrow('maxConsecutiveErrors must be a positive integer')
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
