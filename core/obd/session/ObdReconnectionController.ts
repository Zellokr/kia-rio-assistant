export type ObdLinkSuspectReason
  = | 'transport-state'
    | 'poll-halt'
    | 'manual'

export type ObdReconnectionAbortCause
  = | 'user-disconnect'
    | 'unmount'

/**
 * Progressive backoff. Sums to 21s, leaving roughly 9s of headroom under the
 * default 30s wall-clock deadline for the attempts themselves. A schedule
 * summing to 30s was rejected: the 5th attempt would start exactly at the
 * deadline and never run.
 */
export const DEFAULT_RECONNECTION_DELAYS_MS = [
  500,
  1500,
  3000,
  6000,
  10000
] as const

export const DEFAULT_RECONNECTION_DEADLINE_MS = 30_000

export interface ObdReconnectionAttempt {
  attempt: number
  attempts: number
  delayMs: number
  elapsedMs: number
  reason: ObdLinkSuspectReason
}

export interface ObdReconnectionFailure {
  reason: ObdLinkSuspectReason
  attempts: number
  elapsedMs: number
  error?: Error
}

export interface ObdReconnectionControllerOptions {
  delaysMs?: readonly number[]
  deadlineMs?: number
  now?: () => number
  onEnter?: (reason: ObdLinkSuspectReason) => void
  attempt: (context: ObdReconnectionAttempt) => Promise<void>
  onRecovered?: (context: ObdReconnectionAttempt) => void
  onFailed?: (failure: ObdReconnectionFailure) => void
  onAttemptFailed?: (context: ObdReconnectionAttempt, error: Error) => void
  onSignalSuppressed?: (reason: ObdLinkSuspectReason) => void
}

/**
 * Single guard point for OBD link-suspect signals. Both `transport.subscribeState`
 * and `pollScheduler.onHalt` are meant to route through `notifyLinkSuspect`; a
 * first-wins latch guarantees exactly one bounded retry run at a time, even when
 * both signals fire in the same tick. Cancellation reuses `ObdPollScheduler`'s
 * generation-counter idiom instead of `AbortController`: `abort()` increments a
 * private generation, and the run loop re-checks it after every `await` so a
 * late-resolving attempt is dropped rather than reported as recovered.
 */
export class ObdReconnectionController {
  private readonly delaysMs: readonly number[]
  private readonly deadlineMs: number
  private readonly now: () => number

  private activeState = false
  private disposed = false
  private generation = 0
  private lastAbortCause: ObdReconnectionAbortCause | undefined

  constructor(
    private readonly options: ObdReconnectionControllerOptions
  ) {
    this.delaysMs = options.delaysMs ?? DEFAULT_RECONNECTION_DELAYS_MS
    this.deadlineMs = options.deadlineMs ?? DEFAULT_RECONNECTION_DEADLINE_MS
    this.now = options.now ?? Date.now
  }

  get active(): boolean {
    return this.activeState
  }

  /**
   * First-wins latch. Returns `true` only for the call that starts a run;
   * any call while a run is already active (or after `dispose()`) returns
   * `false` and fires `onSignalSuppressed` so the signal still becomes
   * session-log evidence.
   */
  notifyLinkSuspect(reason: ObdLinkSuspectReason): boolean {
    if (this.disposed || this.activeState) {
      this.options.onSignalSuppressed?.(reason)
      return false
    }

    this.activeState = true

    const generation = ++this.generation
    const startedAt = this.now()

    this.options.onEnter?.(reason)
    void this.runAttempts(reason, generation, startedAt)

    return true
  }

  abort(cause: ObdReconnectionAbortCause): void {
    this.lastAbortCause = cause

    if (!this.activeState) {
      return
    }

    this.activeState = false
    this.generation++
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.abort('unmount')
  }

  private async runAttempts(
    reason: ObdLinkSuspectReason,
    generation: number,
    startedAt: number
  ): Promise<void> {
    const attempts = this.delaysMs.length
    let lastError: Error | undefined

    for (let index = 0; index < attempts; index++) {
      const delayMs = this.delaysMs[index]

      await this.delay(delayMs)

      if (generation !== this.generation) {
        return
      }

      const elapsedMs = this.now() - startedAt

      if (elapsedMs >= this.deadlineMs) {
        break
      }

      const context: ObdReconnectionAttempt
        = { attempt: index + 1, attempts, delayMs, elapsedMs, reason }

      try {
        await this.options.attempt(context)
      } catch (error) {
        if (generation !== this.generation) {
          return
        }

        lastError = error instanceof Error ? error : new Error(String(error))
        this.options.onAttemptFailed?.(context, lastError)
        continue
      }

      if (generation !== this.generation) {
        return
      }

      this.activeState = false
      this.options.onRecovered?.(context)
      return
    }

    if (generation !== this.generation) {
      return
    }

    this.activeState = false
    this.options.onFailed?.({
      reason,
      attempts,
      elapsedMs: this.now() - startedAt,
      error: lastError
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
