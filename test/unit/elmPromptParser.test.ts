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
})
