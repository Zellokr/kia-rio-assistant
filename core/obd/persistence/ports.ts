import type { DtcState, DtcType } from '../dtc/DtcCode'
import type { PersistableObdSessionEvent } from './persistedEventAllowlist'
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
  /**
   * Narrowed to the allowlisted subset on purpose.
   *
   * Raw byte events (`rx-chunk`, `tx`, `command-queued`, `rx-frame`) and
   * telemetry-sourced `decoded-value` are what RF-017's "la base local no
   * crece sin control" targets, so they must never reach storage. Enforcing
   * that here means every adapter — present and future — is safe by
   * construction, instead of each one re-implementing `isPersistableEvent`
   * and eventually drifting apart. The only way to build one of these is to
   * pass through that type guard.
   */
  event: PersistableObdSessionEvent
}

export interface PersistedDtcObservationV1 {
  schemaVersion: 1
  id: string
  sessionId: string
  code: string
  observedAt: string
}

export interface PersistedDtcObservation {
  schemaVersion: 2
  id: string
  sessionId: string
  code: string
  type: DtcType
  state: DtcState
  observedAt: string
}

export type PersistedDtcObservationRecord = PersistedDtcObservationV1 | PersistedDtcObservation

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
  recordObservations(observations: PersistedDtcObservationRecord[]): Promise<void>
  listObservations(): Promise<PersistedDtcObservation[]>
  deleteObservation(id: string): Promise<void>
}

export interface SupportedPidCacheRepository {
  read(fingerprint: string): Promise<PersistedSupportedPidCache | undefined>
  write(cache: PersistedSupportedPidCache): Promise<void>
}
