import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  DEFAULT_RECONNECTION_DEADLINE_MS,
  DEFAULT_RECONNECTION_DELAYS_MS,
  ObdReconnectionController
} from '../../core/obd/session/ObdReconnectionController'

import type {
  ObdReconnectionAttempt
} from '../../core/obd/session/ObdReconnectionController'

const TOTAL_BACKOFF_MS = DEFAULT_RECONNECTION_DELAYS_MS.reduce(
  (sum, delayMs) => sum + delayMs,
  0
)

afterEach(() => {
  vi.useRealTimers()
})

describe('ObdReconnectionController', () => {
  it('is a first-wins latch: one attempt sequence even when both signals fire in the same tick', () => {
    vi.useFakeTimers()

    const attempt = vi.fn(async () => {})
    const onEnter = vi.fn()
    const onSignalSuppressed = vi.fn()
    const controller = new ObdReconnectionController({ attempt, onEnter, onSignalSuppressed })

    const transportSignal = controller.notifyLinkSuspect('transport-state')
    const pollHaltSignal = controller.notifyLinkSuspect('poll-halt')

    expect(transportSignal).toBe(true)
    expect(pollHaltSignal).toBe(false)
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(onEnter).toHaveBeenCalledWith('transport-state')
    expect(onSignalSuppressed).toHaveBeenCalledTimes(1)
    expect(onSignalSuppressed).toHaveBeenCalledWith('poll-halt')
  })

  it('calls onEnter exactly once per run regardless of how many times it is re-notified', () => {
    vi.useFakeTimers()

    const attempt = vi.fn(async () => {})
    const onEnter = vi.fn()
    const controller = new ObdReconnectionController({ attempt, onEnter })

    controller.notifyLinkSuspect('poll-halt')
    controller.notifyLinkSuspect('poll-halt')
    controller.notifyLinkSuspect('poll-halt')

    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(onEnter).toHaveBeenCalledWith('poll-halt')
  })

  it('waits each configured delay before invoking attempt, in order', async () => {
    vi.useFakeTimers()

    const observedDelays: number[] = []
    const attempt = vi.fn(async (context: ObdReconnectionAttempt) => {
      observedDelays.push(context.delayMs)
      throw new Error('still down')
    })
    const controller = new ObdReconnectionController({ attempt })

    controller.notifyLinkSuspect('poll-halt')

    for (const delayMs of DEFAULT_RECONNECTION_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delayMs)
    }

    expect(observedDelays).toEqual([...DEFAULT_RECONNECTION_DELAYS_MS])
  })

  it('exhausts all 5 attempts under the deadline and reports onFailed', async () => {
    vi.useFakeTimers()

    const attempt = vi.fn(async () => {
      throw new Error('still down')
    })
    const onAttemptFailed = vi.fn()
    const onFailed = vi.fn()
    const controller = new ObdReconnectionController({
      attempt,
      onAttemptFailed,
      onFailed,
      now: Date.now
    })

    controller.notifyLinkSuspect('poll-halt')
    await vi.advanceTimersByTimeAsync(TOTAL_BACKOFF_MS)

    expect(attempt).toHaveBeenCalledTimes(5)
    expect(onAttemptFailed).toHaveBeenCalledTimes(5)
    expect(onFailed).toHaveBeenCalledTimes(1)

    const failure = onFailed.mock.calls[0]?.[0]

    expect(failure.reason).toBe('poll-halt')
    expect(failure.attempts).toBe(5)
    expect(failure.elapsedMs).toBeLessThanOrEqual(DEFAULT_RECONNECTION_DEADLINE_MS)
    expect(failure.error).toBeInstanceOf(Error)
    expect(controller.active).toBe(false)
  })

  it('does not start another attempt once the injected clock has crossed the deadline', async () => {
    vi.useFakeTimers()

    const attempt = vi.fn(async () => {
      throw new Error('still down')
    })
    const onFailed = vi.fn()
    const controller = new ObdReconnectionController({
      attempt,
      onFailed,
      deadlineMs: 2000,
      now: Date.now
    })

    controller.notifyLinkSuspect('poll-halt')
    await vi.advanceTimersByTimeAsync(TOTAL_BACKOFF_MS)

    // Delay 1 (500ms) elapses at 500ms, under the 2000ms deadline: it runs.
    // Delay 2 (1500ms) elapses at 2000ms, at the deadline: it must NOT run.
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(onFailed.mock.calls[0]?.[0]?.elapsedMs).toBeLessThanOrEqual(2000)
  })

  it('drops a late-resolving attempt after abort and never calls onRecovered', async () => {
    vi.useFakeTimers()

    let resolveAttempt: (() => void) | undefined
    const attempt = vi.fn(() => new Promise<void>((resolve) => {
      resolveAttempt = resolve
    }))
    const onRecovered = vi.fn()
    const controller = new ObdReconnectionController({ attempt, onRecovered })

    controller.notifyLinkSuspect('poll-halt')
    await vi.advanceTimersByTimeAsync(DEFAULT_RECONNECTION_DELAYS_MS[0])

    expect(attempt).toHaveBeenCalledTimes(1)

    controller.abort('user-disconnect')
    resolveAttempt?.()

    await Promise.resolve()
    await Promise.resolve()

    expect(onRecovered).not.toHaveBeenCalled()
    expect(controller.active).toBe(false)
  })

  it('dispose stops all further activity and rejects new runs', async () => {
    vi.useFakeTimers()

    const attempt = vi.fn(async () => {
      throw new Error('still down')
    })
    const onFailed = vi.fn()
    const onSignalSuppressed = vi.fn()
    const controller = new ObdReconnectionController({
      attempt,
      onFailed,
      onSignalSuppressed
    })

    controller.notifyLinkSuspect('poll-halt')
    await vi.advanceTimersByTimeAsync(DEFAULT_RECONNECTION_DELAYS_MS[0])

    expect(attempt).toHaveBeenCalledTimes(1)

    controller.dispose()
    await vi.advanceTimersByTimeAsync(TOTAL_BACKOFF_MS)

    expect(attempt).toHaveBeenCalledTimes(1)
    expect(onFailed).not.toHaveBeenCalled()

    const startedAfterDispose = controller.notifyLinkSuspect('manual')

    expect(startedAfterDispose).toBe(false)
    expect(onSignalSuppressed).toHaveBeenCalledWith('manual')
  })

  it('calls onRecovered on a successful attempt and releases the latch for a later run', async () => {
    vi.useFakeTimers()

    const attempt = vi.fn(async () => {})
    const onRecovered = vi.fn()
    const onEnter = vi.fn()
    const controller = new ObdReconnectionController({ attempt, onRecovered, onEnter })

    controller.notifyLinkSuspect('poll-halt')
    await vi.advanceTimersByTimeAsync(DEFAULT_RECONNECTION_DELAYS_MS[0])

    expect(onRecovered).toHaveBeenCalledTimes(1)
    expect(controller.active).toBe(false)

    const secondRun = controller.notifyLinkSuspect('poll-halt')

    expect(secondRun).toBe(true)
    expect(onEnter).toHaveBeenCalledTimes(2)
  })
})

describe('a hung attempt', () => {
  /**
   * Found on the vehicle on 2026-08-28. The driver walked out of range, the
   * BLE connect never returned — neither the transport nor the native
   * connectGatt carries a timeout — and the controller sat awaiting it. The
   * log shows one `reconnect-attempt` where five were due, then nothing at
   * all: no further attempts, no failure, no word to the driver.
   *
   * The deadline was checked only between attempts, so an attempt that
   * never settled put it permanently out of reach.
   */
  it('gives up on an attempt that never settles and keeps going', async () => {
    vi.useFakeTimers()

    const started: number[] = []
    let releaseFirst: (() => void) | undefined

    const controller = new ObdReconnectionController({
      now: () => Date.now(),
      attempt: async (context) => {
        started.push(context.attempt)

        if (context.attempt === 1) {
          // Never settles on its own, exactly like a BLE connect to an
          // adapter that is no longer in range.
          await new Promise<void>((resolve) => {
            releaseFirst = resolve
          })
        }
      }
    })

    controller.notifyLinkSuspect('transport-state')

    await vi.advanceTimersByTimeAsync(1000)
    expect(started).toEqual([1])

    // Past the 12s an attempt may hold, several times over. Bounded only by
    // the overall deadline, the first would have spent all 30 s and the
    // remaining four would never have started.
    await vi.advanceTimersByTimeAsync(40_000)

    expect(started.length).toBeGreaterThan(1)
    expect(controller.active).toBe(false)

    releaseFirst?.()
    vi.useRealTimers()
  })

  /**
   * The run has to end for the driver, not merely stop attempting. A
   * controller that goes quiet leaves the screen claiming it is still
   * reconnecting forever.
   */
  it('reports failure rather than going silent', async () => {
    vi.useFakeTimers()

    const onFailed = vi.fn()
    let release: (() => void) | undefined

    const controller = new ObdReconnectionController({
      now: () => Date.now(),
      onFailed,
      attempt: () => new Promise<void>((resolve) => {
        release = resolve
      })
    })

    controller.notifyLinkSuspect('poll-halt')
    await vi.advanceTimersByTimeAsync(40_000)

    expect(onFailed).toHaveBeenCalledOnce()
    expect(controller.active).toBe(false)

    release?.()
    vi.useRealTimers()
  })
})
