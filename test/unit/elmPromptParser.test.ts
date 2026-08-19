import { describe, expect, it } from 'vitest'

import { ElmPromptParser } from '../../core/obd/parser/ElmPromptParser'

const encoder = new TextEncoder()

describe('ElmPromptParser', () => {
  it('parses a complete response', () => {
    const parser = new ElmPromptParser()

    const result = parser.push(
      encoder.encode('41 05 5A\r>')
    )

    expect(result).toHaveLength(1)

    expect(result[0]?.normalizedText)
      .toBe('41 05 5A')
  })

  it('reconstructs fragmented responses', () => {
    const parser = new ElmPromptParser()

    expect(
      parser.push(encoder.encode('41 0'))
    ).toEqual([])

    expect(
      parser.push(encoder.encode('C 1A'))
    ).toEqual([])

    const result = parser.push(
      encoder.encode(' F8\r>')
    )

    expect(result).toHaveLength(1)

    expect(result[0]?.normalizedText)
      .toBe('41 0C 1A F8')
  })

  it('parses several responses in one chunk', () => {
    const parser = new ElmPromptParser()

    const result = parser.push(
      encoder.encode(
        'OK\r>41 05 5A\r>'
      )
    )

    expect(result).toHaveLength(2)

    expect(result[0]?.normalizedText)
      .toBe('OK')

    expect(result[1]?.normalizedText)
      .toBe('41 05 5A')
  })

  it('keeps incomplete data buffered', () => {
    const parser = new ElmPromptParser()

    const result = parser.push(
      encoder.encode('41 0C')
    )

    expect(result).toEqual([])

    expect(parser.getPendingBuffer())
      .toBe('41 0C')
  })

  it('normalizes line breaks', () => {
    const parser = new ElmPromptParser()

    const result = parser.push(
      encoder.encode(
        '41 0C\r\n1A F8\r\n>'
      )
    )

    expect(result[0]?.normalizedText)
      .toBe('41 0C 1A F8')
  })

  it('strips the command echo when echoCommand is passed', () => {
    const parser = new ElmPromptParser()

    const result = parser.push(
      encoder.encode(
        '0100\r\rSEARCHING...\r41 00 BE 3F A8 13\r>'
      ),
      '0100'
    )

    expect(result).toHaveLength(1)

    expect(result[0]?.normalizedText)
      .toBe('41 00 BE 3F A8 13')
  })

  it('drops SEARCHING... arriving in a separate chunk from the data', () => {
    const parser = new ElmPromptParser()

    expect(
      parser.push(encoder.encode('SEARCHING'))
    ).toEqual([])

    expect(
      parser.push(encoder.encode('...\r41 00 BE'))
    ).toEqual([])

    const result = parser.push(
      encoder.encode(' 3F A8 13\r>')
    )

    expect(result).toHaveLength(1)

    expect(result[0]?.normalizedText)
      .toBe('41 00 BE 3F A8 13')
  })

  it('reconstructs a CRLF pair split exactly across a chunk boundary', () => {
    const parser = new ElmPromptParser()

    expect(
      parser.push(encoder.encode('41 0C\r'))
    ).toEqual([])

    const result = parser.push(
      encoder.encode('\n1A F8\r\n>')
    )

    expect(result).toHaveLength(1)

    expect(result[0]?.normalizedText)
      .toBe('41 0C 1A F8')
  })

  it('reconstructs a full response delivered one byte at a time', () => {
    const parser = new ElmPromptParser()
    const bytes = encoder.encode('41 00 BE 3F A8 13\r>')

    let responses: ReturnType<ElmPromptParser['push']> = []

    for (const byte of bytes) {
      responses = parser.push(Uint8Array.of(byte))
    }

    expect(responses).toHaveLength(1)

    expect(responses[0]?.normalizedText)
      .toBe('41 00 BE 3F A8 13')

    expect(parser.getPendingBuffer()).toBe('')
  })

  it('completes the frame when the prompt arrives alone in its own chunk', () => {
    const parser = new ElmPromptParser()

    expect(
      parser.push(encoder.encode('41 05 5A\r'))
    ).toEqual([])

    const result = parser.push(encoder.encode('>'))

    expect(result).toHaveLength(1)

    expect(result[0]?.normalizedText)
      .toBe('41 05 5A')
  })

  it('drops NUL bytes fragmented into the middle of the stream', () => {
    const parser = new ElmPromptParser()

    expect(
      parser.push(encoder.encode('41 05'))
    ).toEqual([])

    // Marginal BLE link injects a NUL byte between chunks.
    expect(
      parser.push(Uint8Array.of(0x00))
    ).toEqual([])

    const result = parser.push(encoder.encode(' 5A\r>'))

    expect(result).toHaveLength(1)

    expect(result[0]?.normalizedText)
      .toBe('41 05 5A')
  })

  it('strips the ATZ banner NUL padding but keeps the version line', () => {
    const parser = new ElmPromptParser()

    const result = parser.push(
      encoder.encode('ATZ\r\r\x00ELM327 v1.5\r\x00>'),
      'ATZ'
    )

    expect(result).toHaveLength(1)

    expect(result[0]?.normalizedText)
      .toBe('ELM327 v1.5')
  })
})
