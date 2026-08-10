import type { ElmResponseKind } from '../../core/obd/protocol/classifyElmResponse'
import type { ObdTransportMetadata } from '../../core/obd/transport/ObdTransport'

export interface ReplaySessionEventInput {
  type: string
  commandId?: string
  command?: string
  rawText?: string
  normalizedText?: string
  responseKind?: string
  latencyMs?: number
  error?: {
    name: string
    message: string
    phase: string
  }
}

export interface CreateReplaySessionOptions {
  sessionId?: string
  startedAt?: string
  endedAt?: string | null
  transport?: ObdTransportMetadata
  retention?: {
    maxEvents?: number
    droppedEvents?: number
    complete?: boolean
  }
}

const DEFAULT_STARTED_AT = '2026-08-08T10:00:00.000Z'
const DEFAULT_ENDED_AT = '2026-08-08T10:01:00.000Z'

/**
 * Builds a Step-16 schema-v1 session export from loosely typed event inputs.
 * Auto-assigns 1-indexed `sequence` and `elapsedMs = index * 10`.
 */
export function createSession(
  events: ReplaySessionEventInput[],
  options: CreateReplaySessionOptions = {}
) {
  const startedAt = options.startedAt ?? DEFAULT_STARTED_AT
  const startedAtMs = Date.parse(startedAt)

  return {
    schemaVersion: 1 as const,
    sessionId: options.sessionId ?? 'recording-1',
    startedAt,
    endedAt: options.endedAt === undefined
      ? DEFAULT_ENDED_AT
      : options.endedAt,
    transport: options.transport ?? {
      kind: 'mock' as const,
      name: 'Recorded adapter'
    },
    retention: {
      maxEvents: options.retention?.maxEvents ?? 100,
      droppedEvents: options.retention?.droppedEvents ?? 0,
      complete: options.retention?.complete ?? true
    },
    events: events.map((event, index) => ({
      ...event,
      sequence: index + 1,
      timestamp: new Date(
        startedAtMs + index * 10
      ).toISOString(),
      elapsedMs: index * 10
    }))
  }
}

/**
 * Builds a `tx` + `rx-chunk`* + terminating `rx-frame` event sequence for one
 * recorded command transaction.
 */
export function responseEvents(
  commandId: string,
  command: string,
  chunks: string[],
  normalizedText: string,
  responseKind: ElmResponseKind = 'obd-data'
): ReplaySessionEventInput[] {
  return [
    {
      type: 'tx',
      commandId,
      command,
      rawText: `${command}\r`,
      normalizedText: command
    },
    ...chunks.map(rawText => ({
      type: 'rx-chunk',
      commandId,
      command,
      rawText
    })),
    {
      type: 'rx-frame',
      commandId,
      command,
      rawText: chunks.join(''),
      normalizedText,
      responseKind,
      latencyMs: chunks.length * 10
    }
  ]
}

export function timeoutEvents(
  commandId: string,
  command: string,
  message = `Timeout waiting for ELM327 response to ${command}`,
  latencyMs = 1000
): ReplaySessionEventInput[] {
  return [
    {
      type: 'tx',
      commandId,
      command,
      rawText: `${command}\r`,
      normalizedText: command
    },
    {
      type: 'error',
      commandId,
      command,
      latencyMs,
      error: {
        name: 'Error',
        message,
        phase: 'timeout'
      }
    }
  ]
}

export function transportWriteErrorEvents(
  commandId: string,
  command: string,
  message = 'Recorded adapter disconnected'
): ReplaySessionEventInput[] {
  return [
    {
      type: 'tx',
      commandId,
      command,
      rawText: `${command}\r`,
      normalizedText: command
    },
    {
      type: 'error',
      commandId,
      command,
      error: {
        name: 'Error',
        message,
        phase: 'transport-write'
      }
    }
  ]
}

export function buildNormalResponseSession() {
  return createSession(responseEvents(
    'command-1',
    '010C',
    ['41 0C 1A F8\r>'],
    '41 0C 1A F8'
  ))
}

export function buildNoDataSession() {
  return createSession(responseEvents(
    'command-1',
    '0199',
    ['NO DATA\r>'],
    'NO DATA',
    'no-data'
  ))
}

export function buildTimeoutSession() {
  return createSession(timeoutEvents('command-3', '0198'))
}

export function buildTransportErrorSession() {
  return createSession(transportWriteErrorEvents(
    'command-1',
    '010C',
    'Recorded adapter disconnected'
  ))
}

export function buildUnableToConnectSession() {
  return createSession(responseEvents(
    'command-1',
    '010C',
    ['UNABLE TO CONNECT\r>'],
    'UNABLE TO CONNECT',
    'unable-to-connect'
  ))
}

export function buildBusInitErrorSession() {
  return createSession(responseEvents(
    'command-1',
    '010C',
    ['BUS INIT: ERROR\r>'],
    'BUS INIT: ERROR',
    'bus-init-error'
  ))
}

export function buildStoppedSession() {
  return createSession(responseEvents(
    'command-1',
    '010C',
    ['STOPPED\r>'],
    'STOPPED',
    'stopped'
  ))
}

export function buildUnknownCommandSession() {
  return createSession(responseEvents(
    'command-1',
    '010C',
    ['?\r>'],
    '?',
    'unknown-command'
  ))
}

export function buildFragmentedResponseSession() {
  return createSession(responseEvents(
    'command-1',
    '010C',
    ['41 0', 'C 1A', ' F8\r>'],
    '41 0C 1A F8'
  ))
}

export function buildDtcP0300Session() {
  return createSession(responseEvents(
    'command-1',
    '03',
    ['43 03 00 00 00\r>'],
    '43 03 00 00 00'
  ))
}

export function buildDtcP0420Session() {
  return createSession(responseEvents(
    'command-1',
    '03',
    ['43 04 20 00 00\r>'],
    '43 04 20 00 00'
  ))
}

/**
 * Mid-response disconnect is a *test-time action*, not a distinct schema
 * event/outcome. Call `transport.disconnect()` between chunk deliveries;
 * `ReplayObdTransport.write()` already stops emitting remaining chunks if
 * `generation` changes or `state !== 'connected'` mid-replay (see
 * `core/obd/transport/ReplayObdTransport.ts` around the chunk loop).
 */
export function buildMidResponseDisconnectSession() {
  return createSession(responseEvents(
    'command-1',
    '010C',
    ['41 0', 'C 1A', ' F8\r>'],
    '41 0C 1A F8'
  ))
}
