import type { ObdSessionEvent } from '../logging/ObdSessionLog'
import type { ObdSessionRepository } from './ports'
import { isPersistableEvent } from './persistedEventAllowlist'

export const PERSISTENCE_FLUSH_INTERVAL_MS = 2_000
export const PERSISTENCE_FLUSH_EVENT_LIMIT = 200

export interface BufferedObdSessionRecorderOptions {
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
}

export class BufferedObdSessionRecorder {
  private readonly setTimer: typeof setTimeout

  private readonly clearTimer: typeof clearTimeout

  private events: ObdSessionEvent[] = []

  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly sessionId: string,
    private readonly repository: Pick<ObdSessionRepository, 'appendEvents'>,
    options: BufferedObdSessionRecorderOptions = {}
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
      }))).catch(() => {})
    } catch {
      // Persistence must never affect OBD execution.
    }
  }
}
