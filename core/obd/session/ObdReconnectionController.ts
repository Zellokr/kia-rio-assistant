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

/**
 * Raised from 30 s on 2026-08-28. The old budget predated the rescan
 * fallback and could not fit even one slow attempt, which would have made
 * that fallback unreachable — code that can never succeed is worse than no
 * code at all. 60 s fits two, and still ends rather than retrying forever.
 */
export const DEFAULT_RECONNECTION_DEADLINE_MS = 60_000

/**
 * How long one attempt may run before it is abandoned.
 *
 * Sized so the slow path can finish. A straight reconnect took 6.6–8.4 s on
 * the vehicle across twenty measured sessions, but an attempt whose device
 * handle died with the Bluetooth adapter falls back to a fresh scan first —
 * a fixed 5 s in `BleObdBridgePlugin.SCAN_DURATION_MS` — so scan plus
 * connect is roughly 13.5 s. 20 s covers that with margin.
 *
 * A cap is still needed. Bounded only by the overall deadline, one hung
 * attempt consumes the entire run and the later ones — the ones that catch
 * an adapter coming back — never start. That is the shape of the
 * 2026-08-28 failure, not a fix for it.
 */
export const DEFAULT_RECONNECTION_ATTEMPT_TIMEOUT_MS = 20_000

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
  attemptTimeoutMs?: number
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
 *
 * The deadline is enforced against a running attempt, not only between
 * attempts. It was checked only between them until 2026-08-28, when the
 * vehicle showed what that costs: the driver walked out of range, the BLE
 * connect never returned — neither `AndroidBleObdTransport.connect` nor the
 * native `connectGatt` carries a timeout of its own — and the loop sat
 * awaiting an attempt that would never settle. One `reconnect-attempt` was
 * logged where five were due, no failure was ever reported, and the app
 * simply stopped saying anything. A deadline that a hung attempt can put
 * out of reach is not a deadline.
 */
export class ObdReconnectionController {
  private readonly delaysMs: readonly number[]
  private readonly deadlineMs: number
  private readonly attemptTimeoutMs: number
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
    this.attemptTimeoutMs = options.attemptTimeoutMs
      ?? DEFAULT_RECONNECTION_ATTEMPT_TIMEOUT_MS
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
      const delayMs = this.delaysMs[index]!

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
        /**
         * Bounded twice: by its own timeout, and by whatever is left of the
         * overall deadline. An attempt that never settles is abandoned
         * rather than allowed to hold the loop open forever, and it cannot
         * spend the whole run either — the later attempts are the ones that
         * catch an adapter coming back into range.
         *
         * Abandoned, not cancelled: nothing here can force a hung BLE
         * connect to return. The generation check after the race is what
         * keeps its eventual result — if it ever arrives — from being read
         * as a recovery that already timed out.
         */
        await this.withDeadline(
          this.options.attempt(context),
          Math.min(this.attemptTimeoutMs, this.deadlineMs - elapsedMs)
        )
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

  /**
   * Rejects if `work` has not settled within `ms`.
   *
   * The timer is always cleared, including on the winning path: a pending
   * one keeps the event loop alive, which in tests looks like a hang and on
   * a phone is a wakeup nobody asked for.
   */
  private withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
    if (ms <= 0) {
      return Promise.reject(
        new Error('Reconnection deadline reached before the attempt began')
      )
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(
          `Reconnection attempt exceeded the ${ms} ms left of its deadline`
        ))
      }, ms)

      work.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        }
      )
    })
  }
}
