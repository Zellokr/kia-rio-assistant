import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'
import { effectScope } from 'vue'

import { ObdSessionLog } from '../../core/obd/logging/ObdSessionLog'
import { useObdSessionLog } from '../../app/composables/useObdSessionLog'

interface FakeAnchor {
  href: string
  download: string
  click: ReturnType<typeof vi.fn>
}

function runComposable(log: ObdSessionLog) {
  const scope = effectScope()
  const api = scope.run(() => useObdSessionLog(log))!

  return { scope, api }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useObdSessionLog downloadJson', () => {
  it('defers revoking the object URL until after the click so the download is not cut off', () => {
    vi.useFakeTimers()

    const revokeObjectURL = vi.fn()
    const anchor: FakeAnchor = {
      href: '',
      download: '',
      click: vi.fn()
    }

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL
    })
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor)
    })

    const log = new ObdSessionLog({
      transport: { kind: 'mock', name: 'Mock ELM327' }
    })
    const { scope, api } = runComposable(log)

    api.downloadJson()

    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(anchor.href).toBe('blob:mock-url')
    expect(anchor.download).toMatch(/^obd-session-.*\.json$/)

    // The URL must still be alive right after the click.
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()

    // Only after the download has been handed off is the URL released.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    scope.stop()
  })

  it('does nothing when there is no document (server/native without DOM)', () => {
    vi.stubGlobal('document', undefined)

    const log = new ObdSessionLog({
      transport: { kind: 'mock' }
    })
    const { scope, api } = runComposable(log)

    expect(() => api.downloadJson()).not.toThrow()

    scope.stop()
  })
})
