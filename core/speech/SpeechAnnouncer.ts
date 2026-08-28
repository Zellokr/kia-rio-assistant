/**
 * Owns whether the assistant is allowed to speak, and proves it can.
 *
 * RF-031 (MUST) asks for short TTS with a way to silence it, accepted only if
 * "el usuario puede usar la app sin audio". Two rules follow from that and are
 * enforced here rather than in the UI:
 *
 *  - **Off is the default.** Audio that starts on its own in a car is a
 *    hazard, not a feature.
 *  - **A speech failure is never the caller's problem.** `announce` always
 *    resolves. A diagnostic that throws because the phone lost its voice is
 *    worse than a silent one.
 *
 * ADR-012 adds the third rule. It refuses to assume the platform engine is
 * reachable from this WebView, so enabling does not ask the API whether it
 * works — it *speaks*, and believes the result. `detectSpeechCapability`
 * reports reachability and is explicit that it proves nothing; this class is
 * where the proof actually happens.
 */

/**
 * The narrow slice of a speech engine this needs. `speak` must reject when the
 * utterance does not come out, which is what makes enabling a real test.
 */
export interface SpeechSynthesisPort {
  speak: (text: string) => Promise<void>
  cancel: () => void
}

export type AnnouncerState = 'off' | 'on' | 'unavailable'

/** Spanish, user-facing: this is spoken aloud in the car. */
const CONFIRMATION = 'Voz activada'

export class SpeechAnnouncer {
  private currentState: AnnouncerState = 'off'
  private reason: string | null = null

  constructor(public port: SpeechSynthesisPort) {}

  get state(): AnnouncerState {
    return this.currentState
  }

  /** Why speech is unavailable, in the engine's own words. Null unless unavailable. */
  get unavailableReason(): string | null {
    return this.reason
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
    try {
      await this.port.speak(CONFIRMATION)

      this.currentState = 'on'
      this.reason = null
    } catch (error) {
      this.currentState = 'unavailable'
      this.reason = error instanceof Error
        ? error.message
        : String(error)
    }
  }

  /** Silence it, cutting off anything mid-sentence. Also clears a stale failure. */
  disable(): void {
    this.port.cancel()

    this.currentState = 'off'
    this.reason = null
  }

  async toggle(): Promise<void> {
    if (this.currentState === 'on') {
      this.disable()

      return
    }

    await this.enable()
  }

  /**
   * Say something, if allowed. Silent while off or unavailable, and never
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
      this.currentState = 'unavailable'
      this.reason = error instanceof Error
        ? error.message
        : String(error)
    }
  }
}
