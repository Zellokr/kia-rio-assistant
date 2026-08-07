import {
  describe,
  expect,
  it
} from 'vitest'

import {
  classifyElmResponse,
  isElmErrorResponse
} from '../../core/obd/protocol/classifyElmResponse'

describe('classifyElmResponse', () => {
  it('classifies OBD data', () => {
    expect(
      classifyElmResponse('41 0C 1A F8')
    ).toBe('obd-data')
  })

  it('classifies OK', () => {
    expect(
      classifyElmResponse('OK')
    ).toBe('ok')
  })

  it('classifies adapter identification', () => {
    expect(
      classifyElmResponse('ELM327 v1.5')
    ).toBe('adapter-id')
  })

  it('classifies NO DATA', () => {
    expect(
      classifyElmResponse('NO DATA')
    ).toBe('no-data')
  })

  it('classifies STOPPED', () => {
    expect(
      classifyElmResponse('STOPPED')
    ).toBe('stopped')
  })

  it('classifies unable to connect', () => {
    expect(
      classifyElmResponse(
        'UNABLE TO CONNECT'
      )
    ).toBe('unable-to-connect')
  })

  it('classifies bus initialization errors', () => {
    expect(
      classifyElmResponse(
        'BUS INIT: ...ERROR'
      )
    ).toBe('bus-init-error')
  })

  it('classifies unknown commands', () => {
    expect(
      classifyElmResponse('?')
    ).toBe('unknown-command')
  })

  it('identifies error responses', () => {
    expect(
      isElmErrorResponse('no-data')
    ).toBe(true)

    expect(
      isElmErrorResponse('obd-data')
    ).toBe(false)
  })
})
