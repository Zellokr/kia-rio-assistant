import type { ObdSessionEvent } from '../logging/ObdSessionLog'
import type { ObdTransportMetadata } from '../transport/ObdTransport'

export interface PersistedObdSessionRecord {
  schemaVersion: 1
  sessionId: string
  startedAt: string
  endedAt: string | null
  transport: ObdTransportMetadata
  reconnectCount: number
  truncated: boolean
}

export interface PersistedObdSessionEventRecord {
  schemaVersion: 1
  sessionId: string
  event: ObdSessionEvent
}

export interface PersistedDtcObservation {
  schemaVersion: 1
  id: string
  sessionId: string
  code: string
  observedAt: string
}

export interface PersistedSupportedPidCache {
  schemaVersion: 1
  fingerprint: string
  pids: string[]
}

export interface ObdSessionRepository {
  startSession(session: PersistedObdSessionRecord): Promise<void>
  updateSession(session: PersistedObdSessionRecord): Promise<void>
  appendEvents(events: PersistedObdSessionEventRecord[]): Promise<void>
  listSessions(): Promise<PersistedObdSessionRecord[]>
  loadSession(sessionId: string): Promise<{
    session: PersistedObdSessionRecord
    events: PersistedObdSessionEventRecord[]
  } | undefined>
  deleteSession(sessionId: string): Promise<void>
}

export interface DtcRepository {
  recordObservations(observations: PersistedDtcObservation[]): Promise<void>
  listObservations(): Promise<PersistedDtcObservation[]>
  deleteObservation(id: string): Promise<void>
}

export interface SupportedPidCacheRepository {
  read(fingerprint: string): Promise<PersistedSupportedPidCache | undefined>
  write(cache: PersistedSupportedPidCache): Promise<void>
}
