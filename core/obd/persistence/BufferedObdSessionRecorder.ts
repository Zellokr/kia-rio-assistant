import type { ObdSessionEvent } from '../logging/ObdSessionLog'
import type { ObdSessionRepository } from './ports'
import type { PersistableObdSessionEvent } from './persistedEventAllowlist'
import { isPersistableEvent } from './persistedEventAllowlist'

export const PERSISTENCE_FLUSH_INTERVAL_MS = 2_000
export const PERSISTENCE_FLUSH_EVENT_LIMIT = 200

export interface BufferedObdSessionRecorderOptions {
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
  onError?: (error: unknown) => void
}

export class BufferedObdSessionRecorder {
  private readonly setTimer: typeof setTimeout

  private readonly clearTimer: typeof clearTimeout

  // Narrowed by the `isPersistableEvent` guard in `record()`. Keeping the
  // narrow type here is what lets `flush()` build `PersistedObdSessionEventRecord`
  // without a cast, so the allowlist is enforced by the compiler downstream.
  private events: PersistableObdSessionEvent[] = []

  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly sessionId: string,
    private readonly repository: Pick<ObdSessionRepository, 'appendEvents'>,
    private readonly options: BufferedObdSessionRecorderOptions = {}
  ) {
    this.setTimer = options.setTimeout ?? setTimeout
    this.clearTimer = options.clearTimeout ?? clearTimeout
  }

  record(event: ObdSessionEvent): void {
    if (!isPersistableEvent(event)) return

    this.events.push(structuredClone(event))
    if (this.events.length >= PERSISTENCE_FLUSH_EVENT_LIMIT) {
      this.flush()
    } else if (!this.timer) {
      this.timer = this.setTimer(() => this.flush(), PERSISTENCE_FLUSH_INTERVAL_MS)
    }
  }

  finish(): void {
    this.flush()
  }

  private flush(): void {
    if (this.timer) {
      this.clearTimer(this.timer)
      this.timer = undefined
    }

    const events = this.events.splice(0)
    if (!events.length) return

    try {
      void this.repository.appendEvents(events.map(event => ({
        schemaVersion: 1 as const,
        sessionId: this.sessionId,
        event
      }))).catch(error => this.options.onError?.(error))
    } catch (error) {
      this.options.onError?.(error)
      // Persistence must never affect OBD execution.
    }
  }
}
