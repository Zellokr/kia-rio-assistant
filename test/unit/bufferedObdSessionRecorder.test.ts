import { describe, expect, it, vi } from 'vitest'
import { BufferedObdSessionRecorder } from '../../core/obd/persistence/BufferedObdSessionRecorder'

const event = (sequence = 1) => ({ type: 'session-state' as const, state: 'ready' as const, sequence, timestamp: '2026-08-25T20:00:00.000Z', elapsedMs: 0 })
function setup() {
  const appendEvents = vi.fn().mockResolvedValue(undefined)
  return { appendEvents, recorder: new BufferedObdSessionRecorder('one', { appendEvents }) }
}
describe('buffered OBD session recorder', () => {
  it('flushes at two seconds but not before', async () => {
    vi.useFakeTimers()
    const { appendEvents, recorder } = setup()
    recorder.record(event())
    await vi.advanceTimersByTimeAsync(1_999)
    expect(appendEvents).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(appendEvents).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
  it('flushes at two hundred events', () => {
    const { appendEvents, recorder } = setup()
    for (let index = 0; index < 199; index++) recorder.record(event(index))
    expect(appendEvents).not.toHaveBeenCalled()
    recorder.record(event(199))
    expect(appendEvents).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ sessionId: 'one' })]))
  })
  it('flushes immediately on finish and ignores write rejection', () => {
    const { appendEvents, recorder } = setup()
    appendEvents.mockRejectedValueOnce(new Error('quota'))
    recorder.record(event())
    recorder.finish()
    expect(appendEvents).toHaveBeenCalledOnce()
  })

  /**
   * A failed write is reported as an `error` event on the `persistence`
   * phase, and that report travels through the same subscription every other
   * event does — so without this exclusion it would be queued for the store
   * that just rejected it. Each rejected flush would raise another one: the
   * buffer never drains while the store is broken, and it grows.
   *
   * Errors from every other phase are still stored; only the report of a
   * failure to store is not.
   */
  it('never stores the report of a failed write', () => {
    const { appendEvents, recorder } = setup()

    const errorEvent = (phase: 'persistence' | 'poll') => ({
      type: 'error' as const,
      error: { name: 'Error', message: 'quota', phase },
      sequence: 1,
      timestamp: '2026-08-25T20:00:00.000Z',
      elapsedMs: 0
    })

    recorder.record(errorEvent('persistence'))
    recorder.finish()
    expect(appendEvents).not.toHaveBeenCalled()

    recorder.record(errorEvent('poll'))
    recorder.finish()
    expect(appendEvents).toHaveBeenCalledOnce()
  })
})
