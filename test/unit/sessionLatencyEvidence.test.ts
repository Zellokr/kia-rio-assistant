import {
  describe,
  expect,
  it
} from 'vitest'

import { ElmCommandExecutor } from '../../core/obd/protocol/ElmCommandExecutor'
import { ObdSessionLog } from '../../core/obd/logging/ObdSessionLog'
import type { ObdRxFrameEvent, ObdErrorEvent } from '../../core/obd/logging/ObdSessionLog'
import { MockObdTransport } from '../../core/obd/transport/MockObdTransport'

/**
 * STEP_18_PHYSICAL_TEST.md requires the exported session to carry per-command
 * latency ("latencias") as physical evidence. These tests pin that the value
 * survives from the executor into the exported JSON for both a successful read
 * and a timeout, so a regression cannot silently drop the evidence.
 */
describe('session log latency evidence', () => {
  it('records per-command latency on the rx-frame event in the export', async () => {
    const transport = new MockObdTransport()
    const log = new ObdSessionLog({
      transport: { kind: 'mock', name: 'Mock ELM327' }
    })
    const executor = new ElmCommandExecutor(
      transport,
      event => log.record(event)
    )

    await transport.select()
    await transport.connect()

    await expect(executor.execute('0105')).resolves.toMatchObject({
      normalizedText: '41 05 5A'
    })

    log.finish()

    const rxFrame = log.getExport().events.find(
      (event): event is ObdRxFrameEvent => event.type === 'rx-frame'
    )

    expect(rxFrame).toBeDefined()
    expect(typeof rxFrame?.latencyMs).toBe('number')
    expect(rxFrame?.latencyMs).toBeGreaterThanOrEqual(0)

    executor.dispose()
  })

  it('records latency on the error event when a command times out', async () => {
    const transport = new MockObdTransport()
    const log = new ObdSessionLog({
      transport: { kind: 'mock', name: 'Mock ELM327' }
    })
    const executor = new ElmCommandExecutor(
      transport,
      event => log.record(event)
    )

    await transport.select()
    await transport.connect()

    // 0198 is the mock's "adapter does not answer" command; a short timeout
    // forces the timeout path before the mock would have replied.
    await expect(executor.execute('0198', 40)).rejects.toThrow(
      'Timeout waiting for ELM327 response'
    )

    log.finish()

    const timeoutError = log.getExport().events.find(
      (event): event is ObdErrorEvent =>
        event.type === 'error' && event.error.phase === 'timeout'
    )

    expect(timeoutError).toBeDefined()
    expect(typeof timeoutError?.latencyMs).toBe('number')
    expect(timeoutError?.latencyMs).toBeGreaterThanOrEqual(0)

    executor.dispose()
  })
})
