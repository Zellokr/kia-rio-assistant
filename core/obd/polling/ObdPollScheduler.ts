import type {
  ElmCommandResult
} from '../protocol/ElmCommandExecutor'

export interface ObdPollExecutor {
  execute(
    command: string,
    timeoutMs?: number,
  ): Promise<ElmCommandResult>
}

export interface ObdPollTask {
  id: string
  command: string
  intervalMs: number
  timeoutMs?: number
}

export interface ObdPollResult {
  task: ObdPollTask
  result: ElmCommandResult
}

export interface ObdPollError {
  task: ObdPollTask
  error: Error
}

interface ScheduledTask {
  task: ObdPollTask
  nextRunAt: number
}

export interface ObdPollSchedulerOptions {
  /**
   * Stops the loop after this many consecutive failed polls and notifies
   * `onHalt`. A real BLE adapter drop otherwise makes every poll reject, and
   * without a limit the scheduler would flood error listeners forever. A
   * successful poll resets the streak. Omitted means unlimited (legacy
   * behavior).
   */
  maxConsecutiveErrors?: number
}

export class ObdPollScheduler {
  private readonly tasks = new Map<
    string,
    ScheduledTask
  >()

  private readonly resultListeners = new Set<
    (event: ObdPollResult) => void
  >()

  private readonly errorListeners = new Set<
    (event: ObdPollError) => void
  >()

  private readonly haltListeners = new Set<
    (event: ObdPollError) => void
  >()

  private running = false
  private generation = 0
  private consecutiveErrors = 0
  private readonly maxConsecutiveErrors?: number

  constructor(
    private readonly executor: ObdPollExecutor,
    options: ObdPollSchedulerOptions = {}
  ) {
    const limit = options.maxConsecutiveErrors

    if (limit !== undefined) {
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error(
          'maxConsecutiveErrors must be a positive integer'
        )
      }

      this.maxConsecutiveErrors = limit
    }
  }

  addTask(task: ObdPollTask): void {
    if (task.intervalMs <= 0) {
      throw new Error(
        'Poll interval must be greater than zero'
      )
    }

    this.tasks.set(task.id, {
      task,
      nextRunAt: Date.now()
    })
  }

  removeTask(id: string): void {
    this.tasks.delete(id)
  }

  clearTasks(): void {
    this.tasks.clear()
  }

  start(): void {
    if (this.running) {
      return
    }

    this.running = true
    this.generation++
    this.consecutiveErrors = 0

    const generation = this.generation
    const now = Date.now()

    for (const scheduled of this.tasks.values()) {
      scheduled.nextRunAt = now
    }

    void this.runLoop(generation)
  }

  stop(): void {
    if (!this.running) {
      return
    }

    this.running = false
    this.generation++
  }

  isRunning(): boolean {
    return this.running
  }

  onResult(
    listener: (event: ObdPollResult) => void
  ): () => void {
    this.resultListeners.add(listener)

    return () => {
      this.resultListeners.delete(listener)
    }
  }

  onError(
    listener: (event: ObdPollError) => void
  ): () => void {
    this.errorListeners.add(listener)

    return () => {
      this.errorListeners.delete(listener)
    }
  }

  /**
   * Fires once when the consecutive-failure limit stops the loop, carrying the
   * failure that tripped it. Lets the UI reflect the lost link (stop telemetry,
   * surface the error) instead of silently going quiet.
   */
  onHalt(
    listener: (event: ObdPollError) => void
  ): () => void {
    this.haltListeners.add(listener)

    return () => {
      this.haltListeners.delete(listener)
    }
  }

  private async runLoop(generation: number): Promise<void> {
    while (this.running && this.generation === generation) {
      const scheduled = this.findNextTask()

      if (!scheduled) {
        await this.delay(50)
        continue
      }

      const now = Date.now()

      if (scheduled.nextRunAt > now) {
        await this.delay(
          Math.min(
            scheduled.nextRunAt - now,
            50
          )
        )

        continue
      }

      await this.executeTask(scheduled, generation)
    }
  }

  private findNextTask():
    | ScheduledTask
    | undefined {
    let next: ScheduledTask | undefined

    for (const scheduled of this.tasks.values()) {
      if (
        !next
        || scheduled.nextRunAt < next.nextRunAt
      ) {
        next = scheduled
      }
    }

    return next
  }

  private async executeTask(
    scheduled: ScheduledTask,
    generation: number
  ): Promise<void> {
    const { task } = scheduled

    try {
      const result = await this.executor.execute(
        task.command,
        task.timeoutMs ?? 3000
      )

      // El comando pudo haber terminado después
      // de detener o reiniciar la telemetría.
      if (
        !this.running
        || generation !== this.generation
      ) {
        return
      }

      this.consecutiveErrors = 0

      for (const listener of this.resultListeners) {
        listener({
          task,
          result
        })
      }
    } catch (error) {
    // Si ya hemos parado, ignoramos también
    // errores pertenecientes al ciclo anterior.
      if (
        !this.running
        || generation !== this.generation
      ) {
        return
      }

      const normalizedError
        = error instanceof Error
          ? error
          : new Error(String(error))
      const event: ObdPollError = {
        task,
        error: normalizedError
      }

      for (const listener of this.errorListeners) {
        listener(event)
      }

      this.consecutiveErrors++

      if (
        this.maxConsecutiveErrors !== undefined
        && this.consecutiveErrors >= this.maxConsecutiveErrors
      ) {
        this.haltAfterFailures(event)
        return
      }
    } finally {
      if (
        this.running
        && generation === this.generation
      ) {
        scheduled.nextRunAt
          = Date.now() + task.intervalMs
      }
    }
  }

  private haltAfterFailures(event: ObdPollError): void {
    this.running = false
    this.generation++

    for (const listener of this.haltListeners) {
      listener(event)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
