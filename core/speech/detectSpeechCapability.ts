/**
 * Reachability probe for the Web Speech APIs inside the Capacitor WebView.
 *
 * ADR-012 decides that speech uses the device's own engines, and explicitly
 * refuses to assume those engines are reachable from web APIs in this shell.
 * The project already paid for that assumption once: `WebSerialRfcommTransport`
 * was written and unit-tested against a browser API that does not exist inside
 * the Android WebView, then deleted (SPEC_DEVIATIONS deviation 1).
 *
 * So this module answers one narrow question — *is the API even there, and does
 * it enumerate anything* — and is deliberate about the question it CANNOT
 * answer. Reachability is not function: only speaking an utterance proves
 * synthesis works, and only a `start()` attempt proves recognition works. See
 * `provesItWorks`, which is always false.
 */

/** Only what the probe reads. Injected so the probe stays pure and testable. */
export interface SpeechCapabilityHost {
  readonly speechSynthesis?: { getVoices?: () => ReadonlyArray<{ lang?: string }> }
  readonly SpeechRecognition?: unknown
  readonly webkitSpeechRecognition?: unknown
}

/**
 * `available` is only ever claimed for synthesis, and only once voices have
 * actually been enumerated. Recognition tops out at `reachable`, because
 * nothing short of starting it distinguishes a working recognizer from a
 * constructor that throws or is denied on first use.
 */
export type SpeechSupport
  = | 'absent'
    | 'reachable'
    | 'reachable-but-unusable'
    | 'available'

export type RecognitionVendor = 'standard' | 'webkit'

export interface SpeechCapabilityReport {
  readonly synthesis: SpeechSupport
  readonly recognition: SpeechSupport
  readonly recognitionVendor: RecognitionVendor | null
  readonly voiceCount: number
  readonly spanishVoiceCount: number
  /**
   * Always false. A synchronous probe cannot prove either engine works; it is
   * a field rather than a comment so the answer travels with the report when
   * it is serialized off the device.
   */
  readonly provesItWorks: false
  /** Spanish, user-facing — this report is read on a lab screen in the car. */
  readonly notes: ReadonlyArray<string>
}

function detectSynthesis(
  host: SpeechCapabilityHost,
  notes: string[]
): { support: SpeechSupport, voices: ReadonlyArray<{ lang?: string }> } {
  const synthesis = host.speechSynthesis

  if (!synthesis) {
    notes.push(
      'speechSynthesis no existe en este WebView: el TTS necesitará un puente nativo de Capacitor.'
    )

    return { support: 'absent', voices: [] }
  }

  if (typeof synthesis.getVoices !== 'function') {
    notes.push(
      'speechSynthesis existe pero no expone getVoices(): alcanzable, no utilizable.'
    )

    return { support: 'reachable-but-unusable', voices: [] }
  }

  let voices: ReadonlyArray<{ lang?: string }>

  try {
    voices = synthesis.getVoices() ?? []
  } catch {
    notes.push(
      'speechSynthesis.getVoices() lanzó una excepción: alcanzable, no utilizable.'
    )

    return { support: 'reachable-but-unusable', voices: [] }
  }

  if (voices.length === 0) {
    notes.push(
      'speechSynthesis no devuelve voces. Puede ser un fallo real o una carga asíncrona: reintenta tras el evento voiceschanged antes de concluir nada.'
    )

    return { support: 'reachable-but-unusable', voices: [] }
  }

  return { support: 'available', voices }
}

function detectRecognition(
  host: SpeechCapabilityHost,
  notes: string[]
): { support: SpeechSupport, vendor: RecognitionVendor | null } {
  const vendor: RecognitionVendor | null
    = host.SpeechRecognition
      ? 'standard'
      : host.webkitSpeechRecognition
        ? 'webkit'
        : null

  if (!vendor) {
    notes.push(
      'No hay constructor de SpeechRecognition: el STT necesitará un puente nativo de Capacitor.'
    )

    return { support: 'absent', vendor: null }
  }

  notes.push(
    'El constructor de SpeechRecognition existe, pero eso no prueba que funcione: solo un start() real distingue un reconocedor operativo de uno que falla o es denegado al primer uso.'
  )

  return { support: 'reachable', vendor }
}

/**
 * Probe the host for Web Speech reachability. Pure: pass `window` at the call
 * site, never read a global here.
 */
export function detectSpeechCapability(
  host: SpeechCapabilityHost
): SpeechCapabilityReport {
  const notes: string[] = []

  const synthesis = detectSynthesis(host, notes)
  const recognition = detectRecognition(host, notes)

  const spanishVoiceCount = synthesis.voices.filter(
    voice => voice.lang?.toLowerCase().startsWith('es') ?? false
  ).length

  if (synthesis.support === 'available' && spanishVoiceCount === 0) {
    notes.push(
      'Hay voces pero ninguna en español: el TTS hablaría en otro idioma. Falta el paquete de idioma del sistema.'
    )
  }

  return {
    synthesis: synthesis.support,
    recognition: recognition.support,
    recognitionVendor: recognition.vendor,
    voiceCount: synthesis.voices.length,
    spanishVoiceCount,
    provesItWorks: false,
    notes
  }
}
