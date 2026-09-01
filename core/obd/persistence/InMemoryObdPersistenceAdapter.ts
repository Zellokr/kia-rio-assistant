import type {
  DiagnosticAssessmentRepository,
  DtcRepository,
  MaintenanceRepository,
  ObdSessionRepository,
  PersistedDiagnosticAssessment,
  PersistedDtcObservation,
  PersistedMaintenanceRecord,
  PersistedObdSessionEventRecord,
  PersistedObdSessionRecord,
  PersistedSupportedPidCache,
  SupportedPidCacheRepository
} from './ports'
import type { SyncOperation, SyncQueueRepository } from '../../sync/ports'
import { isPersistableEvent } from './persistedEventAllowlist'

export const MAX_PERSISTED_SESSIONS = 20
export const MAX_PERSISTED_EVENTS_PER_SESSION = 5_000

export interface InMemoryObdPersistenceAdapterOptions {
  onWrite?: () => void
}

function clone<Value>(value: Value): Value {
  return structuredClone(value)
}

export class InMemoryObdPersistenceAdapter implements
  ObdSessionRepository,
  DtcRepository,
  DiagnosticAssessmentRepository,
  MaintenanceRepository,
  SyncQueueRepository,
  SupportedPidCacheRepository {
  private readonly sessions = new Map<string, PersistedObdSessionRecord>()
  private readonly events = new Map<string, PersistedObdSessionEventRecord[]>()
  private readonly observations = new Map<string, PersistedDtcObservation>()
  private readonly assessments = new Map<string, PersistedDiagnosticAssessment>()
  private readonly maintenance = new Map<string, PersistedMaintenanceRecord>()
  private readonly caches = new Map<string, PersistedSupportedPidCache>()

  private readonly queued = new Map<string, SyncOperation>()

  private consecutiveWriteFailures = 0

  private degradedState = false

  constructor(
    private readonly options: InMemoryObdPersistenceAdapterOptions = {}
  ) {}

  get degraded(): boolean {
    return this.degradedState
  }

  async startSession(session: PersistedObdSessionRecord): Promise<void> {
    await this.persist(() => {
      this.sessions.set(session.sessionId, clone(session))
      this.evictOldestSessions()
    })
  }

  async updateSession(session: PersistedObdSessionRecord): Promise<void> {
    await this.persist(() => this.sessions.set(session.sessionId, clone(session)))
  }

  async appendEvents(events: PersistedObdSessionEventRecord[]): Promise<void> {
    await this.persist(() => {
      for (const event of events) {
        if (!isPersistableEvent(event.event)) continue

        const sessionEvents = this.events.get(event.sessionId) ?? []
        if (sessionEvents.length >= MAX_PERSISTED_EVENTS_PER_SESSION) {
          this.markTruncated(event.sessionId)
          continue
        }

        sessionEvents.push(clone(event))
        this.events.set(event.sessionId, sessionEvents)
      }
    })
  }

  async listSessions(): Promise<PersistedObdSessionRecord[]> {
    return [...this.sessions.values()].map(clone)
  }

  async loadSession(sessionId: string): Promise<{
    session: PersistedObdSessionRecord
    events: PersistedObdSessionEventRecord[]
  } | undefined> {
    const session = this.sessions.get(sessionId)

    return session && {
      session: clone(session),
      events: (this.events.get(sessionId) ?? []).map(clone)
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.persist(() => {
      this.sessions.delete(sessionId)
      this.events.delete(sessionId)
      this.forgetAssessmentsOf(sessionId)
    })
  }

  async recordObservations(observations: PersistedDtcObservation[]): Promise<void> {
    await this.persist(() => observations.forEach((observation) => {
      this.observations.set(observation.id, clone(observation))
    }))
  }

  async listObservations(): Promise<PersistedDtcObservation[]> {
    return [...this.observations.values()].map(clone)
  }

  async deleteObservation(id: string): Promise<void> {
    await this.persist(() => this.observations.delete(id))
  }

  async recordAssessment(assessment: PersistedDiagnosticAssessment): Promise<void> {
    await this.persist(() => this.assessments.set(assessment.id, clone(assessment)))
  }

  async listAssessments(): Promise<PersistedDiagnosticAssessment[]> {
    return [...this.assessments.values()].map(clone)
  }

  async deleteAssessment(id: string): Promise<void> {
    await this.persist(() => this.assessments.delete(id))
  }

  async saveMaintenanceRecord(record: PersistedMaintenanceRecord): Promise<void> {
    await this.persist(() => this.maintenance.set(record.id, clone(record)))
  }

  async listMaintenanceRecords(): Promise<PersistedMaintenanceRecord[]> {
    return [...this.maintenance.values()].map(clone)
  }

  async deleteMaintenanceRecord(id: string): Promise<void> {
    await this.persist(() => this.maintenance.delete(id))
  }

  async enqueue(operation: SyncOperation): Promise<void> {
    await this.persist(() => this.queued.set(operation.id, clone(operation)))
  }

  async listPendingOperations(): Promise<SyncOperation[]> {
    return [...this.queued.values()]
      .sort((left, right) => left.enqueuedAt.localeCompare(right.enqueuedAt))
      .map(clone)
  }

  async markOperationsSynced(ids: readonly string[]): Promise<void> {
    await this.persist(() => ids.forEach(id => this.queued.delete(id)))
  }

  async recordOperationFailure(ids: readonly string[]): Promise<void> {
    await this.persist(() => ids.forEach((id) => {
      const operation = this.queued.get(id)

      // Ignored when absent: an earlier drain may have accepted and removed it.
      if (!operation) return

      this.queued.set(id, { ...operation, attempts: operation.attempts + 1 })
    }))
  }

  async read(fingerprint: string): Promise<PersistedSupportedPidCache | undefined> {
    const cache = this.caches.get(fingerprint)

    return cache && clone(cache)
  }

  async write(cache: PersistedSupportedPidCache): Promise<void> {
    await this.persist(() => this.caches.set(cache.fingerprint, clone(cache)))
  }

  private evictOldestSessions(): void {
    const expired = [...this.sessions.values()]
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
      .slice(0, -MAX_PERSISTED_SESSIONS)

    for (const session of expired) {
      this.sessions.delete(session.sessionId)
      this.events.delete(session.sessionId)
      // Evaluations roll off with their session, exactly as events do. The
      // maintenance map is untouched here on purpose: it holds what the owner
      // typed, which no session lifecycle may discard.
      this.forgetAssessmentsOf(session.sessionId)
    }
  }

  private forgetAssessmentsOf(sessionId: string): void {
    for (const [id, assessment] of this.assessments) {
      if (assessment.sessionId === sessionId) {
        this.assessments.delete(id)
      }
    }
  }

  private markTruncated(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) this.sessions.set(sessionId, { ...session, truncated: true })
  }

  private async persist(write: () => void): Promise<void> {
    if (this.degradedState) return

    try {
      this.options.onWrite?.()
      write()
      this.consecutiveWriteFailures = 0
    } catch {
      this.consecutiveWriteFailures++
      this.degradedState = this.consecutiveWriteFailures >= 3
    }
  }
}
