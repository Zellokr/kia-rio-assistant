import { describe, expect, it, vi } from 'vitest'
import { buildVehicleFingerprint } from '../../core/obd/capability/buildVehicleFingerprint'
import { resolveSupportedPids } from '../../core/obd/capability/resolveSupportedPids'
import type { ElmCommandExecutor, ElmCommandResult } from '../../core/obd/protocol/ElmCommandExecutor'

function executor(frame = '41 00 BE 3F A8 13') {
  return {
    execute: vi.fn(async (command: string): Promise<ElmCommandResult> => ({
      command, rawText: frame, normalizedText: frame, responseKind: 'obd-data',
      startedAt: '', completedAt: '', latencyMs: 1
    }))
  } as unknown as ElmCommandExecutor
}

describe('resolveSupportedPids', () => {
  it('revalidates range zero once and reuses a compatible cache', async () => {
    const elm = executor()
    const fingerprint = buildVehicleFingerprint(
      { kind: 'mock', name: ' Adapter ' }, '41 00 BE 3F A8 13'
    )
    const result = await resolveSupportedPids(elm, { kind: 'mock', name: ' Adapter ' }, {
      cache: { read: vi.fn(async () => ({ schemaVersion: 1, fingerprint, pids: ['0C'] })), write: vi.fn() }
    })
    expect([result.pids, result.reusedCache, (elm.execute as ReturnType<typeof vi.fn>).mock.calls])
      .toEqual([['0C'], true, [['0100', 7000]]])
  })

  it('uses the known set during a session reconnect without sending 0100', async () => {
    const elm = executor()
    const result = await resolveSupportedPids(elm, { kind: 'mock' }, {
      reconnect: true, supportedPids: ['0C']
    })
    expect([result.pids, elm.execute]).toEqual([['0C'], expect.any(Function)])
    expect((elm.execute as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('seeds a cache miss instead of repeating the fetched range zero', async () => {
    const execute = vi.fn(async (command: string): Promise<ElmCommandResult> => {
      const normalizedText = command === '0100' ? '41 00 00 00 00 01' : '41 20 00 00 00 00'
      return { command, rawText: normalizedText, normalizedText, responseKind: 'obd-data', startedAt: '', completedAt: '', latencyMs: 1 }
    })
    const write = vi.fn()
    await resolveSupportedPids({ execute } as unknown as ElmCommandExecutor, { kind: 'mock' }, {
      cache: { read: vi.fn(), write }
    })
    expect(execute.mock.calls).toEqual([['0100', 7000], ['0120', 3000]])
    expect(write).toHaveBeenCalledOnce()
  })
})
