import { normalizeElmResponse } from './normalizeElmResponse'

export interface ElmParsedResponse {
  rawText: string
  normalizedText: string
}

export class ElmPromptParser {
  private buffer = ''
  private decoder = new TextDecoder()

  constructor(
    private readonly maxBufferLength = 16_384
  ) {}

  push(chunk: Uint8Array): ElmParsedResponse[] {
    this.buffer += this.decoder.decode(chunk, {
      stream: true
    })

    if (this.buffer.length > this.maxBufferLength) {
      this.reset()

      throw new Error(
        'ELM327 response buffer exceeded maximum size'
      )
    }

    const responses: ElmParsedResponse[] = []

    while (true) {
      const promptIndex = this.buffer.indexOf('>')

      if (promptIndex === -1) {
        break
      }

      const frame = this.buffer.slice(0, promptIndex)

      this.buffer = this.buffer.slice(promptIndex + 1)

      responses.push({
        rawText: `${frame}>`,
        normalizedText: normalizeElmResponse(frame)
      })
    }

    return responses
  }

  reset(): void {
    this.buffer = ''
    this.decoder = new TextDecoder()
  }

  getPendingBuffer(): string {
    return this.buffer
  }
}
