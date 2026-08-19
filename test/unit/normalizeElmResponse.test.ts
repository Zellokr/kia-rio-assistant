import {
  describe,
  expect,
  it
} from 'vitest'

import { normalizeElmResponse } from '../../core/obd/parser/normalizeElmResponse'

describe('normalizeElmResponse', () => {
  it('keeps spaced hex data unchanged', () => {
    expect(
      normalizeElmResponse('41 0C 1A F8')
    ).toBe('41 0C 1A F8')
  })

  it('drops a SEARCHING... line with three dots', () => {
    expect(
      normalizeElmResponse('SEARCHING...\r41 00 BE 3F A8 13')
    ).toBe('41 00 BE 3F A8 13')
  })

  it('drops SEARCHING lines with fewer dots, case-insensitively', () => {
    expect(
      normalizeElmResponse('SEARCHING.\r41 00 BE')
    ).toBe('41 00 BE')

    expect(
      normalizeElmResponse('SEARCHING..\r41 00 BE')
    ).toBe('41 00 BE')

    expect(
      normalizeElmResponse('searching...\r41 00 BE')
    ).toBe('41 00 BE')
  })

  it('preserves a line that merely contains SEARCHING as part of other text', () => {
    expect(
      normalizeElmResponse('SEARCHING...EXTRA\r41 00 BE')
    ).toBe('SEARCHING...EXTRA 41 00 BE')
  })

  it('removes an exact echoed command as the leading line', () => {
    expect(
      normalizeElmResponse('ATZ\r\rELM327 v1.5\r', { echoCommand: 'ATZ' })
    ).toBe('ELM327 v1.5')
  })

  it('matches echo case-insensitively and trims it', () => {
    expect(
      normalizeElmResponse('ATZ\r\rELM327 v1.5\r', { echoCommand: 'atz ' })
    ).toBe('ELM327 v1.5')
  })

  it('preserves lines when echoCommand does not match exactly', () => {
    expect(
      normalizeElmResponse('ATZ\r\rELM327 v1.5\r', { echoCommand: 'ATE0' })
    ).toBe('ATZ ELM327 v1.5')
  })

  it('only strips the echo from the first line position', () => {
    expect(
      normalizeElmResponse('ATZ\rSOME TEXT ATZ MENTION\r', { echoCommand: 'ATZ' })
    ).toBe('SOME TEXT ATZ MENTION')
  })

  it('normalizes bare CR, bare LF, CRLF, and mixed/repeated separators', () => {
    expect(
      normalizeElmResponse('41 0C\r1A F8')
    ).toBe('41 0C 1A F8')

    expect(
      normalizeElmResponse('41 0C\n1A F8')
    ).toBe('41 0C 1A F8')

    expect(
      normalizeElmResponse('41 0C\r\n1A F8')
    ).toBe('41 0C 1A F8')

    expect(
      normalizeElmResponse('41 0C\r\r\n\n1A F8')
    ).toBe('41 0C 1A F8')
  })

  it('strips a trailing NUL byte emitted by a marginal adapter', () => {
    expect(
      normalizeElmResponse('41 05 5A\x00')
    ).toBe('41 05 5A')
  })

  it('strips NUL padding around a noisy ATZ reset banner', () => {
    expect(
      normalizeElmResponse('ATZ\r\r\x00ELM327 v1.5\r', { echoCommand: 'ATZ' })
    ).toBe('ELM327 v1.5')
  })

  it('strips leading NUL bytes before the payload', () => {
    expect(
      normalizeElmResponse('\x00\x00ELM327 v1.5')
    ).toBe('ELM327 v1.5')
  })

  it('strips trailing BEL and DEL control bytes while keeping the hex payload', () => {
    expect(
      normalizeElmResponse('41 05 5A\x07\x7f')
    ).toBe('41 05 5A')
  })

  it('drops a frame that is only control-byte noise', () => {
    expect(
      normalizeElmResponse('\x00\x01\x02')
    ).toBe('')
  })
})
