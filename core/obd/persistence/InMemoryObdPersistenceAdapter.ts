import type {
  DtcRepository,
  ObdSessionRepository,
  PersistedDtcObservation,
  PersistedObdSessionEventRecord,
  PersistedObdSessionRecord,
  PersistedSupportedPidCache,
  SupportedPidCacheRepository
} from './ports'
import { isPersistableEvent } from './persistedEventAllowlist'

export const MAX_PERSISTED_SESSIONS = 20

function clone<Value>(value: Value): Value {
  return structuredClone(value)
}

export class InMemoryObdPersistenceAdapter implements
  ObdSessionRepository,
  DtcRepository,
  SupportedPidCacheRepository {
  private readonly sessions = new Map<string, PersistedObdSessionRecord>()
  private readonly events = new Map<string, PersistedObdSessionEventRecord[]>()
  private readonly observations = new Map<string, PersistedDtcObservation>()
  private readonly caches = new Map<string, PersistedSupportedPidCache>()

  async startSession(session: PersistedObdSessionRecord): Promise<void> {
    this.sessions.set(session.sessionId, clone(session))
    this.evictOldestSessions()
  }

  async updateSession(session: PersistedObdSessionRecord): Promise<void> {
    this.sessions.set(session.sessionId, clone(session))
  }

  async appendEvents(events: PersistedObdSessionEventRecord[]): Promise<void> {
    for (const event of events) {
      if (!isPersistableEvent(event.event)) {
        continue
      }

      const sessionEvents = this.events.get(event.sessionId) ?? []
      sessionEvents.push(clone(event))
      this.events.set(event.sessionId, sessionEvents)
    }
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
    this.sessions.delete(sessionId)
    this.events.delete(sessionId)
  }

  async recordObservations(observations: PersistedDtcObservation[]): Promise<void> {
    for (const observation of observations) {
      this.observations.set(observation.id, clone(observation))
    }
  }

  async listObservations(): Promise<PersistedDtcObservation[]> {
    return [...this.observations.values()].map(clone)
  }

  async deleteObservation(id: string): Promise<void> {
    this.observations.delete(id)
  }

  async read(fingerprint: string): Promise<PersistedSupportedPidCache | undefined> {
    const cache = this.caches.get(fingerprint)

    return cache && clone(cache)
  }

  async write(cache: PersistedSupportedPidCache): Promise<void> {
    this.caches.set(cache.fingerprint, clone(cache))
  }

  private evictOldestSessions(): void {
    const expired = [...this.sessions.values()]
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
      .slice(0, -MAX_PERSISTED_SESSIONS)

    for (const session of expired) {
      this.sessions.delete(session.sessionId)
      this.events.delete(session.sessionId)
    }
  }
}
