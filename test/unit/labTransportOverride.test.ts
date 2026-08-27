import { describe, expect, it } from 'vitest'

import { shouldUseDevMockTransport } from '../../app/utils/labTransportFactory'

/**
 * The override exists so the lab is usable in a browser, where the Capacitor
 * bridge is absent and every selection fails. It is gated twice on purpose:
 * a mock adapter that answered in a shipped build would produce readings
 * that look like a vehicle and are not, which is the one failure this
 * project cannot afford.
 */
describe('development transport override', () => {
  it('is off in a production build even when asked for', () => {
    expect(shouldUseDevMockTransport('?transport=mock', false)).toBe(false)
  })

  it('is off in development unless asked for', () => {
    expect(shouldUseDevMockTransport('', true)).toBe(false)
    expect(shouldUseDevMockTransport('?transport=android-ble', true))
      .toBe(false)
    expect(shouldUseDevMockTransport('?other=mock', true)).toBe(false)
  })

  it('is on when a development build is asked for a mock', () => {
    expect(shouldUseDevMockTransport('?transport=mock', true)).toBe(true)
    expect(shouldUseDevMockTransport('?other=1&transport=mock', true))
      .toBe(true)
  })
})
