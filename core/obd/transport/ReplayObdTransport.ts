import type {
  ObdTransport,
  ObdTransportMetadata,
  ObdTransportState
} from './ObdTransport'

interface ReplayChunk {
  rawText: string
  delayMs: number
}

export interface ReplayTransaction {
  command: string
  chunks: ReplayChunk[]
  outcome: 'response' | 'timeout' | 'transport-error'
  errorMessage?: string
}

export interface ReplayTranscript {
  sourceSessionId: string
  sourceTransportName?: string
  transactions: ReplayTransaction[]
}

export interface ReplayObdTransportOptions {
  /** Multiplies recorded inter-chunk delays. Zero is useful in tests. */
  timingScale?: number
}

interface ReplayEvent {
  type: string
  sequence: number
  elapsedMs: number
  commandId?: string
  command?: string
  rawText?: string
  error?: {
    message?: string
    phase?: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
}

function fail(path: string, expectation: string): never {
  throw new Error(
    `Invalid OBD replay export: ${path} ${expectation}`
  )
}

function requireString(
  value: unknown,
  path: string
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(path, 'must be a non-empty string')
  }

  return value
}

/**
 * Validates recorded rx-chunk payloads. Unlike identifiers, a byte-at-a-time
 * BLE stream legitimately delivers a lone whitespace byte (0x20) or a control
 * byte as its own chunk, so only a truly empty string is rejected here.
 */
function requireRawText(
  value: unknown,
  path: string
): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(path, 'must be a non-empty string')
  }

  return value
}

function requireNonNegativeNumber(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < 0
  ) {
    fail(path, 'must be a non-negative number')
  }

  return value
}

function parseEvents(value: unknown): ReplayEvent[] {
  if (!Array.isArray(value)) {
    fail('events', 'must be an array')
  }

  let previousSequence = 0
  let previousElapsedMs = 0

  return value.map((candidate, index) => {
    const path = `events[${index}]`

    if (!isRecord(candidate)) {
      fail(path, 'must be an object')
    }

    const type = requireString(candidate.type, `${path}.type`)
    const sequence = requireNonNegativeNumber(
      candidate.sequence,
      `${path}.sequence`
    )
    const elapsedMs = requireNonNegativeNumber(
      candidate.elapsedMs,
      `${path}.elapsedMs`
    )

    if (!Number.isInteger(sequence) || sequence <= previousSequence) {
      fail(`${path}.sequence`, 'must increase strictly')
    }
    if (elapsedMs < previousElapsedMs) {
      fail(`${path}.elapsedMs`, 'must not decrease')
    }

    previousSequence = sequence
    previousElapsedMs = elapsedMs

    const event: ReplayEvent = {
      type,
      sequence,
      elapsedMs
    }

    if (candidate.commandId !== undefined) {
      event.commandId = requireString(
        candidate.commandId,
        `${path}.commandId`
      )
    }
    if (candidate.command !== undefined) {
      event.command = requireString(
        candidate.command,
        `${path}.command`
      )
    }
    if (candidate.rawText !== undefined) {
      event.rawText = requireRawText(
        candidate.rawText,
        `${path}.rawText`
      )
    }
    if (candidate.error !== undefined) {
      if (!isRecord(candidate.error)) {
        fail(`${path}.error`, 'must be an object')
      }

      event.error = {
        message: typeof candidate.error.message === 'string'
          ? candidate.error.message
          : undefined,
        phase: typeof candidate.error.phase === 'string'
          ? candidate.error.phase
          : undefined
      }
    }

    if (type === 'tx') {
      requireString(event.commandId, `${path}.commandId`)
      requireString(event.command, `${path}.command`)
    }

    return event
  })
}

/**
 * Validates a Step 16 schema-v1 export and extracts only transport-level
 * command transactions. Decoder and UI events intentionally remain outside
 * replay so the normal application pipeline produces them again.
 */
export function buildReplayTranscript(
  input: unknown
): ReplayTranscript {
  if (!isRecord(input)) {
    fail('root', 'must be an object')
  }
  if (input.schemaVersion !== 1) {
    fail('schemaVersion', 'must be 1')
  }

  const sourceSessionId = requireString(
    input.sessionId,
    'sessionId'
  )

  if (!isRecord(input.retention)) {
    fail('retention', 'must be an object')
  }
  if (input.retention.complete !== true) {
    fail(
      'retention.complete',
      'recording is incomplete'
    )
  }

  if (!isRecord(input.transport)) {
    fail('transport', 'must be an object')
  }

  const sourceTransportName
    = typeof input.transport.name === 'string'
      && input.transport.name.trim() !== ''
      ? input.transport.name
      : undefined
  const events = parseEvents(input.events)
  const transactions: ReplayTransaction[] = []

  for (let index = 0; index < events.length; index++) {
    const tx = events[index]

    if (tx?.type !== 'tx') {
      continue
    }

    const commandId = tx.commandId as string
    const command = (tx.command as string)
      .trim()
      .toUpperCase()
    const chunks: ReplayChunk[] = []
    let previousElapsedMs = tx.elapsedMs
    let fallbackFrame: ReplayEvent | undefined
    let outcome: ReplayTransaction['outcome'] = 'timeout'
    let errorMessage: string | undefined

    for (let cursor = index + 1; cursor < events.length; cursor++) {
      const event = events[cursor]

      if (!event || event.type === 'tx') {
        break
      }
      if (event.commandId !== commandId) {
        continue
      }

      if (event.type === 'rx-chunk') {
        const rawText = requireRawText(
          event.rawText,
          `events[${cursor}].rawText`
        )

        chunks.push({
          rawText,
          delayMs: Math.max(
            0,
            event.elapsedMs - previousElapsedMs
          )
        })
        previousElapsedMs = event.elapsedMs
      } else if (event.type === 'rx-frame') {
        fallbackFrame = event
        outcome = 'response'
        break
      } else if (event.type === 'error') {
        const phase = event.error?.phase

        if (phase === 'transport-write') {
          outcome = 'transport-error'
          errorMessage = event.error?.message
            ?? 'Recorded OBD transport write failed'
          break
        }
        if (phase === 'timeout') {
          outcome = 'timeout'
          break
        }
      }
    }

    if (outcome === 'response' && chunks.length === 0) {
      const rawText = requireString(
        fallbackFrame?.rawText,
        `response frame for ${command}.rawText`
      )

      chunks.push({
        rawText,
        delayMs: Math.max(
          0,
          (fallbackFrame?.elapsedMs ?? tx.elapsedMs)
          - tx.elapsedMs
        )
      })
    }

    transactions.push({
      command,
      chunks,
      outcome,
      ...(errorMessage ? { errorMessage } : {})
    })
  }

  if (transactions.length === 0) {
    fail('events', 'must contain at least one TX transaction')
  }

  return {
    sourceSessionId,
    ...(sourceTransportName ? { sourceTransportName } : {}),
    transactions
  }
}

export class ReplayObdTransport implements ObdTransport {
  readonly kind = 'replay' as const

  state: ObdTransportState = 'idle'

  private readonly transcript: ReplayTranscript

  private readonly timingScale: number

  private readonly listeners = new Set<
    (data: Uint8Array) => void
  >()

  private readonly stateListeners = new Set<
    (state: ObdTransportState) => void
  >()

  private cursor = 0

  private generation = 0

  constructor(
    sessionExport: unknown,
    options: ReplayObdTransportOptions = {}
  ) {
    this.transcript = buildReplayTranscript(sessionExport)
    this.timingScale = options.timingScale ?? 1

    if (
      !Number.isFinite(this.timingScale)
      || this.timingScale < 0
    ) {
      throw new Error(
        'Replay timingScale must be a non-negative number'
      )
    }
  }

  async select(): Promise<ObdTransportMetadata> {
    this.generation++
    this.cursor = 0
    this.setState('selected')

    return this.metadata()
  }

  async connect(): Promise<ObdTransportMetadata> {
    if (this.state !== 'selected' && this.state !== 'disconnected') {
      throw new Error('Replay transport must be selected before connecting')
    }

    this.setState('connected')

    return this.metadata()
  }

  async disconnect(): Promise<void> {
    this.setState('disconnecting')
    this.generation++
    this.setState('disconnected')
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.state !== 'connected') {
      throw new Error('OBD transport is not connected')
    }

    const command = new TextDecoder()
      .decode(data)
      .trim()
      .toUpperCase()
    const transaction = this.transcript.transactions[this.cursor]

    if (!transaction) {
      throw new Error('Replay transcript exhausted')
    }
    if (command !== transaction.command) {
      throw new Error(
        `Replay command mismatch: expected ${transaction.command} but received ${command}`
      )
    }

    this.cursor++

    if (transaction.outcome === 'transport-error') {
      throw new Error(
        transaction.errorMessage
        ?? 'Recorded OBD transport write failed'
      )
    }
    const generation = this.generation

    for (const chunk of transaction.chunks) {
      await this.delay(chunk.delayMs * this.timingScale)

      if (
        generation !== this.generation
        || this.state !== 'connected'
      ) {
        return
      }

      this.emit(new TextEncoder().encode(chunk.rawText))
    }
  }

  subscribe(
    listener: (data: Uint8Array) => void
  ): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeState(
    listener: (state: ObdTransportState) => void
  ): () => void {
    this.stateListeners.add(listener)

    return () => {
      this.stateListeners.delete(listener)
    }
  }

  private setState(next: ObdTransportState): void {
    if (this.state === next) {
      return
    }

    this.state = next

    for (const listener of this.stateListeners) {
      try {
        listener(next)
      } catch {
        // State observers must not break transport transitions.
      }
    }
  }

  private metadata(): ObdTransportMetadata {
    return {
      kind: this.kind,
      name: this.transcript.sourceTransportName
        ? `Replay: ${this.transcript.sourceTransportName}`
        : `Replay: ${this.transcript.sourceSessionId}`
    }
  }

  private emit(data: Uint8Array): void {
    for (const listener of this.listeners) {
      listener(data)
    }
  }

  private delay(ms: number): Promise<void> {
    if (ms === 0) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
