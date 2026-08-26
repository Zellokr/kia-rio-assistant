import {
  isObdTransportUnavailable
} from '../transport/ObdTransport'
import type {
  ObdTransport,
  ObdTransportState
} from '../transport/ObdTransport'
import { ElmPromptParser } from '../parser/ElmPromptParser'
import {
  classifyElmResponse,
  isElmErrorResponse
} from './classifyElmResponse'
import { ElmResponseError } from './ElmResponseError'
import { ElmTimeoutError } from './ElmTimeoutError'

import type {
  ElmResponseKind
} from './classifyElmResponse'
import type {
  ObdErrorPhase,
  ObdSessionEventInput
} from '../logging/ObdSessionLog'

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
  commandId: string
  command: string
  timeoutMs: number
  resolve: (result: ElmCommandResult) => void
  reject: (error: Error) => void
}

const TRANSPORT_UNAVAILABLE_MESSAGE
  = 'OBD transport is not connected'

export class ElmCommandExecutor {
  private readonly parser = new ElmPromptParser()

  private readonly queue: QueueItem[] = []

  private processing = false

  private commandSequence = 0

  private current:
    | {
      item: QueueItem
      startedAt: number
      timer: ReturnType<typeof setTimeout>
    }
    | undefined

  private readonly unsubscribeData: () => void

  private readonly unsubscribeState: () => void

  constructor(
    private readonly transport: ObdTransport,
    private readonly observer?: (
      event: ObdSessionEventInput
    ) => void
  ) {
    this.unsubscribeData = this.transport.subscribe((chunk) => {
      this.handleChunk(chunk)
    })
    this.unsubscribeState = this.transport.subscribeState((state) => {
      this.handleTransportState(state)
    })
  }

  execute(
    command: string,
    timeoutMs = 3000
  ): Promise<ElmCommandResult> {
    return new Promise((resolve, reject) => {
      const normalizedCommand = command
        .trim()
        .toUpperCase()
      const commandId
        = `command-${++this.commandSequence}`

      this.queue.push({
        commandId,
        command: normalizedCommand,
        timeoutMs,
        resolve,
        reject
      })

      this.observe({
        type: 'command-queued',
        commandId,
        command: normalizedCommand
      })

      void this.processNext()
    })
  }

  dispose(): void {
    this.unsubscribeData()
    this.unsubscribeState()

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

    this.processing = false
    this.parser.reset()
  }

  private handleTransportState(state: ObdTransportState): void {
    if (!isObdTransportUnavailable(state)) {
      return
    }

    this.failUnavailable(
      new Error(TRANSPORT_UNAVAILABLE_MESSAGE)
    )
  }

  private failUnavailable(error: Error): void {
    const current = this.current

    if (current) {
      clearTimeout(current.timer)

      this.observeError(
        error,
        'disconnect',
        current.item,
        {
          latencyMs: Date.now() - current.startedAt
        }
      )

      current.item.reject(error)
      this.current = undefined
    }

    while (this.queue.length > 0) {
      const item = this.queue.shift()

      if (!item) {
        continue
      }

      this.observeError(error, 'disconnect', item)
      item.reject(error)
    }

    this.processing = false
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

    if (this.transport.state !== 'connected') {
      this.observeError(
        new Error(TRANSPORT_UNAVAILABLE_MESSAGE),
        'disconnect',
        item
      )
      item.reject(new Error(TRANSPORT_UNAVAILABLE_MESSAGE))
      void this.processNext()
      return
    }

    this.processing = true

    const startedAt = Date.now()

    const timer = setTimeout(() => {
      if (!this.current || this.current.item !== item) {
        return
      }

      const timedOutItem = this.current.item
      const latencyMs = Date.now()
        - this.current.startedAt
      const error = new ElmTimeoutError(
        `Timeout waiting for ELM327 response to ${timedOutItem.command}`
      )

      this.current = undefined
      this.processing = false
      this.parser.reset()

      this.observeError(
        error,
        'timeout',
        timedOutItem,
        { latencyMs }
      )

      timedOutItem.reject(error)

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

      this.observe({
        type: 'tx',
        direction: 'tx',
        commandId: item.commandId,
        command: item.command,
        rawText: `${item.command}\r`,
        normalizedText: item.command
      })

      await this.transport.write(bytes)
    } catch (error) {
      if (!this.current || this.current.item !== item) {
        return
      }

      clearTimeout(timer)

      this.current = undefined
      this.processing = false

      const normalizedError
        = error instanceof Error
          ? error
          : new Error(String(error))

      this.observeError(
        normalizedError,
        'transport-write',
        item,
        {
          latencyMs: Date.now() - startedAt
        }
      )

      item.reject(normalizedError)

      void this.processNext()
    }
  }

  private handleChunk(chunk: Uint8Array): void {
    const current = this.current

    this.observe({
      type: 'rx-chunk',
      direction: 'rx',
      commandId: current?.item.commandId,
      command: current?.item.command,
      rawText: new TextDecoder().decode(chunk)
    })

    let responses

    try {
      responses = this.parser.push(chunk, current?.item.command)
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
      const latencyMs
        = completedAt - current.startedAt

      this.observe({
        type: 'rx-frame',
        direction: 'rx',
        commandId: current.item.commandId,
        command: current.item.command,
        rawText: response.rawText,
        normalizedText: response.normalizedText,
        responseKind,
        latencyMs
      })

      if (isElmErrorResponse(responseKind)) {
        clearTimeout(current.timer)

        const error = new ElmResponseError(
          `ELM327 ${responseKind}: ${response.normalizedText || '<empty>'}`,
          responseKind
        )

        this.observeError(
          error,
          'response',
          current.item,
          {
            direction: 'rx',
            rawText: response.rawText,
            normalizedText: response.normalizedText,
            responseKind,
            latencyMs
          }
        )

        current.item.reject(error)

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
        latencyMs
      })

      this.current = undefined
      this.processing = false

      void this.processNext()
    }
  }

  private failCurrent(error: Error): void {
    if (!this.current) {
      this.observe({
        type: 'error',
        error: {
          name: error.name,
          message: error.message,
          phase: 'parser'
        }
      })

      this.parser.reset()
      return
    }

    clearTimeout(this.current.timer)

    this.observeError(
      error,
      'parser',
      this.current.item,
      {
        latencyMs: Date.now()
          - this.current.startedAt
      }
    )

    this.current.item.reject(error)

    this.current = undefined
    this.processing = false
    this.parser.reset()

    void this.processNext()
  }

  private observe(
    event: ObdSessionEventInput
  ): void {
    try {
      this.observer?.(event)
    } catch {
      // Diagnostic observers must never affect command execution.
    }
  }

  private observeError(
    error: Error,
    phase: ObdErrorPhase,
    item: QueueItem,
    details: Partial<{
      direction: 'tx' | 'rx'
      rawText: string
      normalizedText: string
      responseKind: ElmResponseKind
      latencyMs: number
    }> = {}
  ): void {
    this.observe({
      type: 'error',
      commandId: item.commandId,
      command: item.command,
      error: {
        name: error.name,
        message: error.message,
        phase
      },
      ...details
    })
  }
}
