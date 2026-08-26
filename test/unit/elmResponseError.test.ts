import {
  describe,
  expect,
  it
} from 'vitest'

import {
  ElmResponseError
} from '../../core/obd/protocol/ElmResponseError'

describe('ElmResponseError', () => {
  it('is a typed Error carrying the classified responseKind', () => {
    const error = new ElmResponseError(
      'ELM327 no-data: NO DATA',
      'no-data'
    )

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ElmResponseError')
    expect(error.message).toBe('ELM327 no-data: NO DATA')
    expect(error.responseKind).toBe('no-data')
  })

  it('carries a different responseKind for a different classification', () => {
    const error = new ElmResponseError(
      'ELM327 stopped: STOPPED',
      'stopped'
    )

    expect(error.responseKind).toBe('stopped')
  })
})
