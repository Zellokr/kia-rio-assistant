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
})
