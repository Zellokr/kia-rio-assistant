/**
 * Owns one push-to-talk session and reports honestly what the engine did.
 *
 * This is the recognition counterpart of `SpeechAnnouncer`, and it exists for
 * a measurement rather than for a feature. Check 6 of
 * `docs/SPEECH_DEVICE_VALIDATION.md` found `SpeechRecognition` present in this
 * WebView while `speechSynthesis` was absent — an asymmetry nobody predicted.
 * A present constructor is not a working recognizer, and only a real `start()`
 * tells them apart, so this is the thing that performs that `start()`.
 *
 * It follows the announcer's two hard rules:
 *
 * - **Off by default.** A microphone that opens on its own is worse in a car
 *   than one that needs a press.
 * - **`listen` never throws.** A failing recognizer must not take a screen
 *   down with it.
 *
 * It deliberately **breaks** the announcer's third rule. Speaking may not have
 * its proof retracted by a late failure, because the user already heard the
 * audio. Recognition has no such moment: nothing was perceived, and the errors
 * that arrive after the microphone opens — `no-speech`, `network`,
 * `service-not-allowed` — are the most informative results this probe can
 * produce. So every failure surfaces, whenever it lands, in the engine's own
 * words.
 */

export interface RecognitionHooks {
  /** The engine has the microphone. This is the proof it really started. */
  onStart?: () => void
  /** Interim and final results alike, exactly as the engine worded them. */
  onTranscript?: (text: string, isFinal: boolean) => void
}

/**
 * The narrow slice of a recognizer this needs. `start` resolves when the
 * session ends cleanly and rejects with the engine's own reason otherwise.
 */
export interface SpeechRecognitionPort {
  start: (hooks?: RecognitionHooks) => Promise<void>
  stop: () => void
}

/**
 * `starting` is the gap between the press and the microphone opening — on a
 * phone that gap holds a permission dialog, so it is not a formality.
 */
export type ListenerState
  = | 'idle'
    | 'starting'
    | 'listening'
    | 'unavailable'

export class SpeechListener {
  private currentState: ListenerState = 'idle'
  private reason: string | null = null
  private heard = ''
  private final = false
  private stoppingSession: number | null = null

  /**
   * Counts sessions so a settled promise can tell whether it is still the
   * current one. Releasing the button and the engine's own end event race,
   * and the loser must not overwrite the winner's state.
   */
  private session = 0

  constructor(
    private readonly port: SpeechRecognitionPort,
    private readonly onChange: () => void = () => {}
  ) {}

  get state(): ListenerState {
    return this.currentState
  }

  /** The engine's last reason for failing. Null unless unavailable. */
  get unavailableReason(): string | null {
    return this.reason
  }

  /** Raw, unparsed, exactly as the engine reported it. */
  get transcript(): string {
    return this.heard
  }

  get transcriptIsFinal(): boolean {
    return this.final
  }

  private publish(): void {
    this.onChange()
  }

  /**
   * Open the microphone and keep it open until the engine ends or `stop` is
   * called. Resolves either way; the outcome is read off the state.
   */
  async listen(): Promise<void> {
    const session = ++this.session

    this.currentState = 'starting'
    this.reason = null
    this.heard = ''
    this.final = false

    this.publish()

    try {
      this.stoppingSession = null

      await this.port.start({
        onStart: () => {
          if (this.isStale(session)) {
            return
          }

          this.currentState = 'listening'

          this.publish()
        },
        onTranscript: (text, isFinal) => {
          if (this.isStale(session)) {
            return
          }

          this.heard = text
          this.final = isFinal

          this.publish()
        }
      })

      if (this.isStale(session)) {
        return
      }

      this.currentState = 'idle'

      this.publish()
    } catch (error) {
      if (this.isStale(session)) {
        return
      }

      if (this.stoppingSession === session) {
        this.stoppingSession = null
        this.currentState = 'idle'
        this.reason = null

        this.publish()

        return
      }

      this.currentState = 'unavailable'
      this.reason = describe(error)

      this.publish()
    }
  }

  /** True when a newer session has taken over since this one began. */
  private isStale(session: number): boolean {
    return this.session !== session
  }

  /**
   * Release. Android commonly emits the final transcript after `stop()`, so a
   * button release must not retire the session before that result can arrive.
   * Late failures from the manual stop are still ignored as a user-requested
   * end, not reported as recognizer unavailability.
   */
  stop(): void {
    this.stoppingSession = this.session

    this.port.stop()

    this.currentState = 'idle'
    this.reason = null

    this.publish()
  }
}

function describe(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error)
}
