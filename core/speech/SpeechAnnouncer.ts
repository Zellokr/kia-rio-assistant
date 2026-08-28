/**
 * Owns whether the assistant is allowed to speak, and proves it can.
 *
 * RF-031 (MUST) is only accepted if "el usuario puede usar la app sin audio",
 * so two rules are enforced here rather than in the UI:
 *
 *  - **Off is the default.** Audio that starts on its own in a car is a
 *    hazard, not a feature.
 *  - **A speech failure is never the caller's problem.** `announce` always
 *    resolves. A diagnostic that throws because the phone lost its voice is
 *    worse than a silent one.
 *
 * ADR-012 adds the third rule. It refuses to assume the platform engine is
 * reachable from this WebView, so enabling does not ask the API whether it
 * works — it *speaks*, and believes the result.
 *
 * **The proof is that audio STARTS, not that the phrase finishes.** Waiting
 * for the end of the utterance bought no extra evidence and cost the whole
 * sentence: the button sat unchanged for seconds while the phone was audibly
 * talking. So the state advances on the engine's first sound, and every
 * transition is published through `onChange` — a caller that only syncs after
 * the promise settles would reintroduce exactly that lag.
 */

export interface SpeakHooks {
  /** Fired the instant the engine produces audio. This is the proof. */
  onStart?: () => void
}

/**
 * The narrow slice of a speech engine this needs. `speak` must reject when the
 * utterance does not come out, which is what makes enabling a real test.
 */
export interface SpeechSynthesisPort {
  speak: (text: string, hooks?: SpeakHooks) => Promise<void>
  cancel: () => void
}

/**
 * `starting` is the gap between the press and the engine's first sound. It
 * exists so the button has something honest to show immediately: work is
 * happening, and nothing is proven yet.
 */
export type AnnouncerState = 'off' | 'starting' | 'on' | 'unavailable'

/** Spanish, user-facing: this is spoken aloud in the car. */
const CONFIRMATION = 'Voz activada'

export class SpeechAnnouncer {
  private currentState: AnnouncerState = 'off'
  private reason: string | null = null

  constructor(
    public port: SpeechSynthesisPort,
    private readonly onChange: () => void = () => {}
  ) {}

  get state(): AnnouncerState {
    return this.currentState
  }

  /** Why speech is unavailable, in the engine's own words. Null unless unavailable. */
  get unavailableReason(): string | null {
    return this.reason
  }

  private setState(state: AnnouncerState, reason: string | null = null): void {
    this.currentState = state
    this.reason = reason

    this.onChange()
  }

  /**
   * Turn speech on by using it. The confirmation is not decoration: it is the
   * only thing that distinguishes an engine that works from one that merely
   * exists, and the user hears the answer at the same moment the app learns it.
   *
   * Retrying after a failure is allowed on purpose — the usual cause is a
   * missing system language pack, which the user can go and install.
   */
  async enable(): Promise<void> {
    this.setState('starting')

    let started = false

    try {
      await this.port.speak(CONFIRMATION, {
        onStart: () => {
          started = true

          this.setState('on')
        }
      })

      if (!this.isStale('starting')) {
        this.setState('on')
      }
    } catch (error) {
      /**
       * Once audio has been heard the engine has proven itself. A failure
       * reported afterwards — most often an `onend` that never arrives — must
       * not retract a fact the user already heard.
       */
      if (started) {
        return
      }

      this.setState('unavailable', describe(error))
    }
  }

  /**
   * True when the announcer has moved on since a slow operation began — the
   * user pressed again, or a later call took over. A settled promise must not
   * overwrite a newer state.
   */
  private isStale(expected: AnnouncerState): boolean {
    return this.currentState !== expected
  }

  /** Silence it, cutting off anything mid-sentence. Also clears a stale failure. */
  disable(): void {
    this.port.cancel()

    this.setState('off')
  }

  async toggle(): Promise<void> {
    if (this.currentState === 'on' || this.currentState === 'starting') {
      this.disable()

      return
    }

    await this.enable()
  }

  /**
   * Say something, if allowed. Silent unless the voice is on, and never
   * throws: an engine that dies mid-drive degrades this to `unavailable` and
   * the caller carries on.
   */
  async announce(text: string): Promise<void> {
    if (this.currentState !== 'on') {
      return
    }

    try {
      await this.port.speak(text)
    } catch (error) {
      this.setState('unavailable', describe(error))
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error)
}
