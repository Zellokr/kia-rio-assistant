import type { ObdTransport } from '../transport/ObdTransport'
import { ElmPromptParser } from '../parser/ElmPromptParser'
import {
  classifyElmResponse,
  isElmErrorResponse
} from './classifyElmResponse'

import type {
  ElmResponseKind
} from './classifyElmResponse'

export interface ElmCommandResult {
  command: string
  rawText: string
  normalizedText: string
  responseKind: ElmResponseKind
  startedAt: string
  completedAt: string
  latencyMs: number
}

interface QueueItem {
  command: string
  timeoutMs: number
  resolve: (result: ElmCommandResult) => void
  reject: (error: Error) => void
}

export class ElmCommandExecutor {
  private readonly parser = new ElmPromptParser()

  private readonly queue: QueueItem[] = []

  private processing = false

  private current:
    | {
      item: QueueItem
      startedAt: number
      timer: ReturnType<typeof setTimeout>
    }
    | undefined

  private readonly unsubscribe: () => void

  constructor(
    private readonly transport: ObdTransport
  ) {
    this.unsubscribe = this.transport.subscribe((chunk) => {
      this.handleChunk(chunk)
    })
  }

  execute(
    command: string,
    timeoutMs = 3000
  ): Promise<ElmCommandResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        command: command.trim().toUpperCase(),
        timeoutMs,
        resolve,
        reject
      })

      void this.processNext()
    })
  }

  dispose(): void {
    this.unsubscribe()

    if (this.current) {
      clearTimeout(this.current.timer)

      this.current.item.reject(
        new Error('ELM command executor disposed')
      )

      this.current = undefined
    }

    while (this.queue.length > 0) {
      const item = this.queue.shift()

      item?.reject(
        new Error('ELM command executor disposed')
      )
    }

    this.parser.reset()
  }

  private async processNext(): Promise<void> {
    if (this.processing) {
      return
    }

    const item = this.queue.shift()

    if (!item) {
      return
    }

    this.processing = true

    const startedAt = Date.now()

    const timer = setTimeout(() => {
      if (!this.current) {
        return
      }

      const timedOutItem = this.current.item

      this.current = undefined
      this.processing = false
      this.parser.reset()

      timedOutItem.reject(
        new Error(
          `Timeout waiting for ELM327 response to ${timedOutItem.command}`
        )
      )

      void this.processNext()
    }, item.timeoutMs)

    this.current = {
      item,
      startedAt,
      timer
    }

    try {
      const bytes = new TextEncoder().encode(
        `${item.command}\r`
      )

      await this.transport.write(bytes)
    } catch (error) {
      clearTimeout(timer)

      this.current = undefined
      this.processing = false

      item.reject(
        error instanceof Error
          ? error
          : new Error(String(error))
      )

      void this.processNext()
    }
  }

  private handleChunk(chunk: Uint8Array): void {
    let responses

    try {
      responses = this.parser.push(chunk)
    } catch (error) {
      this.failCurrent(
        error instanceof Error
          ? error
          : new Error(String(error))
      )

      return
    }

    for (const response of responses) {
      if (!this.current) {
        continue
      }

      const current = this.current

      clearTimeout(current.timer)

      const completedAt = Date.now()

      const responseKind = classifyElmResponse(
        response.normalizedText
      )

      if (isElmErrorResponse(responseKind)) {
        clearTimeout(current.timer)

        current.item.reject(
          new Error(
            `ELM327 ${responseKind}: ${response.normalizedText || '<empty>'}`
          )
        )

        this.current = undefined
        this.processing = false

        void this.processNext()

        continue
      }

      current.item.resolve({
        command: current.item.command,
        rawText: response.rawText,
        normalizedText: response.normalizedText,
        startedAt: new Date(
          current.startedAt
        ).toISOString(),
        responseKind,
        completedAt: new Date(
          completedAt
        ).toISOString(),
        latencyMs:
          completedAt - current.startedAt
      })

      this.current = undefined
      this.processing = false

      void this.processNext()
    }
  }

  private failCurrent(error: Error): void {
    if (!this.current) {
      return
    }

    clearTimeout(this.current.timer)

    this.current.item.reject(error)

    this.current = undefined
    this.processing = false
    this.parser.reset()

    void this.processNext()
  }
}
