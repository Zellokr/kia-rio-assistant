import type { DiagnosticAssessment } from '../diagnostics/assessDiagnostics'
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

/**
 * A stored evaluation (RF-034: *"sesiones, DTC, evaluaciones y
 * mantenimientos"*).
 *
 * The assessment is embedded whole rather than recomputed on read. The rules
 * engine evolves, and an evaluation the driver was actually shown is a record
 * of what this app said at that moment — re-deriving it later from stored
 * codes would silently rewrite history every time the rules change.
 *
 * Bound to a session, and only to a session: an evaluation outlives neither
 * the session it describes nor that session's eviction.
 */
export interface PersistedDiagnosticAssessment {
  schemaVersion: 1
  id: string
  sessionId: string
  recordedAt: string
  assessment: DiagnosticAssessment
}

/**
 * An owner-entered maintenance record (RF-036).
 *
 * Every field here is typed by a person. §3's Fase 4 wants upcoming due dates
 * *"sin depender de la ECU"*, and this vehicle's odometer is not on the OBD
 * PIDs this project reads, so `odometerKm` cannot come from the car.
 *
 * **The shape is chosen by this repository, not by the spec.** §8.1 requires
 * `schemaVersion` on every record and RF-036 names the date and the mileage;
 * `item` and `notes` are the minimum needed to make a row mean something, and
 * nothing here should be read as a spec-mandated field list.
 *
 * Unlike sessions, these are never evicted. A capped history of what the
 * owner did to the car would lose the oldest service exactly when a due-date
 * calculation needs it most.
 */
export interface MaintenanceInterval {
  /** Kilometres between services, or `null` when the owner gave only months. */
  km: number | null
  months: number | null
}

export interface PersistedMaintenanceRecord {
  schemaVersion: 1
  id: string
  /** Calendar date as the owner entered it, `YYYY-MM-DD`. */
  performedAt: string
  odometerKm: number
  item: string
  notes: string | null
  /**
   * How often this service repeats, **as the owner stated it**.
   *
   * It is not a Kia figure. The manual the spec names as the source of
   * European intervals carries 618 font dictionaries and no `/ToUnicode`
   * map, so reading it means inferring a font encoding, and a guessed digit
   * in a service-interval table is a claim about a real car. Asking the
   * person who owns the manual is the honest way to get the number, and it
   * keeps the app saying *"this is what you told me"* rather than *"this is
   * what Kia recommends"*.
   *
   * `null` when the owner logged a service without saying when it repeats:
   * the record is still worth keeping, and nothing is projected from it.
   */
  interval: MaintenanceInterval | null
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
  recordObservations(observations: PersistedDtcObservationRecord[]): Promise<void>
  listObservations(): Promise<PersistedDtcObservation[]>
  deleteObservation(id: string): Promise<void>
}

export interface DiagnosticAssessmentRepository {
  recordAssessment(assessment: PersistedDiagnosticAssessment): Promise<void>
  listAssessments(): Promise<PersistedDiagnosticAssessment[]>
  deleteAssessment(id: string): Promise<void>
}

export interface MaintenanceRepository {
  /** Writes by id, so re-saving a corrected row replaces it. */
  saveMaintenanceRecord(record: PersistedMaintenanceRecord): Promise<void>
  listMaintenanceRecords(): Promise<PersistedMaintenanceRecord[]>
  deleteMaintenanceRecord(id: string): Promise<void>
}

export interface SupportedPidCacheRepository {
  read(fingerprint: string): Promise<PersistedSupportedPidCache | undefined>
  write(cache: PersistedSupportedPidCache): Promise<void>
}
