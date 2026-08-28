/**
 * Maps typed Spanish to one of §11's quick commands.
 *
 * RF-030 (MUST) requires push-to-talk **and an equivalent text entry**, and it
 * is only accepted if "la función principal no depende del reconocimiento de
 * voz". This is that text entry. It is not a downgrade for when speech fails:
 * it is the path that makes speech optional, so it is built first and works
 * with no microphone, no permission and no engine.
 *
 * §11 fixes the vocabulary — Estado, DTC, Temperatura, Testigo, Guardar nota —
 * so this recognises those five and nothing else. Open questions are Fase 3's
 * AI provider, which does not exist yet; until it does, unmatched text
 * returns `null` rather than a guess. A wrong command in a moving car is
 * worse than no command.
 */

export type QuickCommandIntent
  = | 'status'
    | 'read-dtc'
    | 'temperature'
    | 'warning-light'
    | 'save-note'

export interface QuickCommandMatch {
  readonly intent: QuickCommandIntent
  /**
   * False when §11 lists the command but nothing in the app can carry it out
   * yet. Kept here rather than in the UI so a caller cannot forget to check
   * and quietly promise something the app does not do.
   */
  readonly supported: boolean
}

interface CommandDefinition {
  readonly intent: QuickCommandIntent
  readonly supported: boolean
  /** Normalised, accent-free keywords. Matched as whole words only. */
  readonly keywords: readonly string[]
}

/**
 * Keywords are what a person types one-handed, not a controlled vocabulary.
 * Plurals and the everyday synonyms for a fault are included because someone
 * reaching for this at a traffic light will not recall the spec's noun.
 */
const COMMANDS: readonly CommandDefinition[] = [
  {
    intent: 'status',
    supported: true,
    keywords: ['estado']
  },
  {
    intent: 'read-dtc',
    supported: true,
    keywords: [
      'dtc',
      'dtcs',
      'averia',
      'averias',
      'codigo',
      'codigos',
      'fallo',
      'fallos'
    ]
  },
  {
    intent: 'temperature',
    supported: true,
    keywords: ['temperatura', 'temp']
  },
  {
    intent: 'warning-light',
    supported: true,
    keywords: ['testigo', 'testigos', 'luz', 'luces']
  },
  {
    /**
     * Listed by §11, backed by nothing. Notes live in Fase 4's maintenance
     * records, which do not exist. Parsing it and reporting it unsupported
     * beats both pretending and silently dropping a command the spec names.
     */
    intent: 'save-note',
    supported: false,
    keywords: ['nota', 'notas', 'apunta', 'apuntar']
  }
]

/** Lowercases, strips accents and splits into words. */
function words(input: string): readonly string[] {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 0)
}

export function parseQuickCommand(
  input: string
): QuickCommandMatch | null {
  const typed = words(input)

  /**
   * Scanned by position in the input rather than by command order, so
   * "estado y temperatura" and "temperatura y estado" resolve differently
   * and predictably — to whichever the person said first.
   */
  for (const word of typed) {
    const command = COMMANDS.find(
      candidate => candidate.keywords.includes(word)
    )

    if (command) {
      return {
        intent: command.intent,
        supported: command.supported
      }
    }
  }

  return null
}
