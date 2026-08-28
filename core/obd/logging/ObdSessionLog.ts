import type {
  DecodedPidValue
} from '../decoder/decodeMode01Response'
import type {
  DtcObservation
} from '../dtc/DtcCode'
import type {
  ElmResponseKind
} from '../protocol/classifyElmResponse'
import type {
  ObdSessionState
} from '../session/ObdSessionStateMachine'
import type {
  ObdTransportMetadata
} from '../transport/ObdTransport'

const DEFAULT_MAX_EVENTS = 50_000

interface ObdSessionEventBase {
  sequence: number
  timestamp: string
  elapsedMs: number
}

export interface ObdCommandQueuedEvent
  extends ObdSessionEventBase {
  type: 'command-queued'
  commandId: string
  command: string
}

export interface ObdTxEvent
  extends ObdSessionEventBase {
  type: 'tx'
  direction: 'tx'
  commandId: string
  command: string
  rawText: string
  normalizedText: string
}

export interface ObdRxChunkEvent
  extends ObdSessionEventBase {
  type: 'rx-chunk'
  direction: 'rx'
  commandId?: string
  command?: string
  rawText: string
}

export interface ObdRxFrameEvent
  extends ObdSessionEventBase {
  type: 'rx-frame'
  direction: 'rx'
  commandId?: string
  command?: string
  rawText: string
  normalizedText: string
  responseKind: ElmResponseKind
  latencyMs?: number
}

export type ObdDecodedPayload
  = | ({ kind: 'pid' } & DecodedPidValue)
    | {
      kind: 'dtc'
      observations: DtcObservation[]
    }

export interface ObdDecodedValueEvent
  extends ObdSessionEventBase {
  type: 'decoded-value'
  source: 'manual' | 'telemetry'
  command: string
  latencyMs: number
  decoded: ObdDecodedPayload
}

export interface ObdCapabilityDiscoveryEvent
  extends ObdSessionEventBase {
  type: 'capability-discovery'
  pids: string[]
  command?: string
  rangeStart?: number
  rangeEnd?: number
  hasNextRange?: boolean
}

export interface ObdSessionStateEvent
  extends ObdSessionEventBase {
  type: 'session-state'
  state: ObdSessionState
}

export interface ObdTelemetryStateEvent
  extends ObdSessionEventBase {
  type: 'telemetry-state'
  state: 'started' | 'stopped'
}

export type ObdErrorPhase
  = | 'selection'
    | 'connection'
    | 'transport-write'
    | 'parser'
    | 'response'
    | 'timeout'
    | 'decode'
    | 'poll'
    | 'disconnect'
    | 'persistence'

export interface ObdErrorEvent
  extends ObdSessionEventBase {
  type: 'error'
  error: {
    name: string
    message: string
    phase: ObdErrorPhase
  }
  commandId?: string
  command?: string
  direction?: 'tx' | 'rx'
  rawText?: string
  normalizedText?: string
  responseKind?: ElmResponseKind
  latencyMs?: number
}

export interface ObdActivityEvent
  extends ObdSessionEventBase {
  type: 'activity'
  activity:
    | 'adapter-selected'
    | 'connected'
    | 'disconnected'
    | 'initialization-started'
    | 'initialization-completed'
    | 'discovery-started'
    | 'discovery-completed'
    | 'queue-test-started'
    | 'queue-test-completed'
    | 'reconnect-started'
    | 'reconnect-attempt'
    | 'reconnected'
    | 'reconnect-failed'
}

export type ObdSessionEvent
  = | ObdCommandQueuedEvent
    | ObdTxEvent
    | ObdRxChunkEvent
    | ObdRxFrameEvent
    | ObdDecodedValueEvent
    | ObdCapabilityDiscoveryEvent
    | ObdSessionStateEvent
    | ObdTelemetryStateEvent
    | ObdErrorEvent
    | ObdActivityEvent

type WithoutEnvelope<Event>
  = Event extends ObdSessionEvent
    ? Omit<Event, keyof ObdSessionEventBase>
    : never

export type ObdSessionEventInput
  = WithoutEnvelope<ObdSessionEvent>

export interface ObdSessionExport {
  schemaVersion: 1
  sessionId: string
  startedAt: string
  endedAt: string | null
  transport: ObdTransportMetadata
  retention: {
    maxEvents: number
    droppedEvents: number
    complete: boolean
  }
  events: ObdSessionEvent[]
}

export type ObdSessionLogChange
  = | {
    type: 'started'
    session: ObdSessionExport
  }
  | {
    type: 'event-recorded'
    event: ObdSessionEvent
    droppedEvents: number
  }
  | {
    type: 'finished'
    endedAt: string
  }

export interface ObdSessionLogOptions {
  transport: ObdTransportMetadata
  maxEvents?: number
  now?: () => number
  idFactory?: () => string
}

function defaultIdFactory(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `obd-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cloneEvent(
  event: ObdSessionEvent
): ObdSessionEvent {
  return structuredClone(event)
}

export class ObdSessionLog {
  private readonly maxEvents: number

  private readonly now: () => number

  private readonly idFactory: () => string

  private readonly listeners = new Set<
    (change: ObdSessionLogChange) => void
  >()

  private events: ObdSessionEvent[] = []

  private sessionId = ''

  private startedAtMs = 0

  private endedAt: string | null = null

  private droppedEvents = 0

  private sequence = 0

  private transport: ObdTransportMetadata

  constructor(options: ObdSessionLogOptions) {
    this.maxEvents = options.maxEvents
      ?? DEFAULT_MAX_EVENTS
    this.now = options.now ?? Date.now
    this.idFactory = options.idFactory
      ?? defaultIdFactory
    this.transport = { ...options.transport }

    if (!Number.isInteger(this.maxEvents) || this.maxEvents <= 0) {
      throw new Error(
        'OBD session log maxEvents must be a positive integer'
      )
    }

    this.resetSession(this.transport)
  }

  start(transport: ObdTransportMetadata): void {
    this.resetSession(transport)
    this.notify({
      type: 'started',
      session: this.getExport()
    })
  }

  updateTransport(transport: ObdTransportMetadata): void {
    this.transport = { ...transport }
  }

  finish(): void {
    if (this.endedAt) {
      return
    }

    this.endedAt = new Date(this.now()).toISOString()

    this.notify({
      type: 'finished',
      endedAt: this.endedAt
    })
  }

  /**
   * Records an event while the session is active.
   * Finished sessions are sealed, so later events are ignored.
   */
  record(
    input: ObdSessionEventInput
  ): ObdSessionEvent | undefined {
    if (this.endedAt) {
      return undefined
    }

    const now = this.now()
    const ownedInput = structuredClone(input)
    const event = {
      ...ownedInput,
      sequence: ++this.sequence,
      timestamp: new Date(now).toISOString(),
      elapsedMs: Math.max(0, now - this.startedAtMs)
    } as ObdSessionEvent

    this.events.push(event)

    if (this.events.length > this.maxEvents) {
      this.events.shift()
      this.droppedEvents++
    }

    const copy = cloneEvent(event)

    this.notify({
      type: 'event-recorded',
      event: copy,
      droppedEvents: this.droppedEvents
    })

    return copy
  }

  subscribe(
    listener: (change: ObdSessionLogChange) => void
  ): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  getExport(): ObdSessionExport {
    return {
      schemaVersion: 1,
      sessionId: this.sessionId,
      startedAt: new Date(
        this.startedAtMs
      ).toISOString(),
      endedAt: this.endedAt,
      transport: { ...this.transport },
      retention: {
        maxEvents: this.maxEvents,
        droppedEvents: this.droppedEvents,
        complete: this.droppedEvents === 0
      },
      events: this.events.map(cloneEvent)
    }
  }

  private resetSession(
    transport: ObdTransportMetadata
  ): void {
    this.transport = { ...transport }
    this.sessionId = this.idFactory()
    this.startedAtMs = this.now()
    this.endedAt = null
    this.events = []
    this.droppedEvents = 0
    this.sequence = 0
  }

  private notify(change: ObdSessionLogChange): void {
    for (const listener of this.listeners) {
      try {
        listener(structuredClone(change))
      } catch {
        // Diagnostic observers must never affect OBD execution.
      }
    }
  }
}
