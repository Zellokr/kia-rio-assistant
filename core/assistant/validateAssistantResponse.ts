import type { AssistantRequest } from './buildAssistantRequest'

/**
 * Checks an AI answer against the payload it was given, per §9.4.
 *
 * RF-033 (MUST) says "validar **siempre** la respuesta de IA". Always, not
 * when it looks suspicious — so this runs on every answer and a caller has
 * no path that skips it (`resolveAssistantAnswer` is that path).
 *
 * **What this can and cannot prove.** §9.4 forbids five things. Three of
 * them are mechanically checkable against the request, one is enforced
 * elsewhere by construction, and one is not checkable at all. Saying which
 * is which matters more than the checks themselves, because a validator
 * that quietly implies more coverage than it has is worse than no validator:
 *
 * 1. *Inventar PIDs, DTC, valores, piezas o procedimientos.* Codes are
 *    checked — every DTC and PID in the text must be one the request
 *    carried. **Invented values, parts and procedures are NOT detectable
 *    here** and this function makes no claim about them. A fabricated torque
 *    figure or a made-up part number passes.
 * 2. *Cambiar una severidad crítica calculada por reglas.* Checked, by
 *    phrase, and only when the local severity is `critical`.
 * 3. *Afirmar que una reparación concreta solucionará el fallo.* Checked,
 *    by phrase.
 * 4. *Autorizar que el usuario siga conduciendo.* Checked against the local
 *    action rather than against a fixed rule: the answer may grant only what
 *    the rules engine already granted.
 * 5. *Enviar comandos al adaptador directamente desde texto generado.* Not
 *    checked here and it does not need to be. `PHYSICAL_ALLOWED_COMMANDS` is
 *    a fixed list of 18 literals enforced at the transport boundary, below
 *    the UI, and Mode 04 is absent from it. Generated text cannot become a
 *    command because no path exists that turns text into one.
 *
 * **Phrase matching is blunt on purpose.** It reads accent-free lowercase
 * text and will occasionally reject an innocent sentence — a negated
 * "esto no lo solucionará" trips the repair rule. That is the direction the
 * error must fall: a false rejection costs the driver a blander local answer
 * that is still correct, while a false acceptance puts an unfounded claim in
 * front of someone deciding whether to keep driving.
 */

export type AssistantRejectionReason
  = | { readonly kind: 'empty' }
    | { readonly kind: 'unknown-dtc', readonly codes: readonly string[] }
    | { readonly kind: 'unknown-pid', readonly pids: readonly string[] }
    | { readonly kind: 'authorises-driving' }
    | { readonly kind: 'downgrades-severity' }
    | { readonly kind: 'promises-a-repair' }

export type AssistantValidation
  = | { readonly outcome: 'accepted', readonly text: string }
    | {
      readonly outcome: 'rejected'
      readonly reasons: readonly AssistantRejectionReason[]
    }

/**
 * Scans for DTCs anywhere in prose, so it is not the anchored pattern
 * `DtcCode` parses with. The layout is the same (SAE J1979: system letter,
 * type digit 0-3, three hex digits) and the word boundaries are what keep
 * "P0128" from also reading as the PID "0128".
 */
const DTC_PATTERN = /\b[PCBU][0-3][0-9A-F]{3}\b/gi

/**
 * Mode 01, 02 and 09 PIDs as this project writes them — `0105`, `010C`.
 * Restricted to those three modes because a bare `03` or `07` in Spanish
 * prose is a number far more often than it is a DTC read.
 */
const PID_PATTERN = /\b0[129][0-9A-F]{2}\b/gi

/**
 * Accent-free and lowercase, because a model writes "conduciendo" or
 * "más" as it pleases and the rule must not depend on that.
 */
const DRIVING_AUTHORISATIONS: readonly string[] = [
  'puedes seguir conduciendo',
  'puede seguir conduciendo',
  'puedes continuar conduciendo',
  'puedes seguir circulando',
  'puedes seguir el viaje',
  'puedes continuar el viaje',
  'puedes llegar a casa',
  'es seguro conducir',
  'es seguro seguir conduciendo',
  'no hay problema en conducir',
  'no hay problema para conducir',
  'puedes conducir sin problema'
]

const SEVERITY_DOWNGRADES: readonly string[] = [
  'no es grave',
  'no es urgente',
  'no reviste gravedad',
  'sin importancia',
  'es un aviso menor',
  'puedes ignorarlo',
  'puedes ignorar',
  'no pasa nada'
]

const REPAIR_PROMISES: readonly string[] = [
  'solucionara',
  'se soluciona con',
  'lo soluciona',
  'arreglara',
  'quedara arreglado',
  'lo arregla',
  'basta con cambiar',
  'basta con sustituir',
  'solo tienes que cambiar',
  'solo hay que cambiar'
]

export function validateAssistantResponse(
  response: string,
  request: AssistantRequest
): AssistantValidation {
  const text = response.trim()

  if (text.length === 0) {
    return {
      outcome: 'rejected',
      reasons: [{ kind: 'empty' }]
    }
  }

  const reasons = collectReasons(text, request)

  return reasons.length > 0
    ? { outcome: 'rejected', reasons }
    : { outcome: 'accepted', text }
}

function collectReasons(
  text: string,
  request: AssistantRequest
): readonly AssistantRejectionReason[] {
  const reasons: AssistantRejectionReason[] = []
  const normalised = normalise(text)

  const unknownCodes = unknownTokens(
    text,
    DTC_PATTERN,
    request.assessment?.dtcs ?? []
  )

  if (unknownCodes.length > 0) {
    reasons.push({ kind: 'unknown-dtc', codes: unknownCodes })
  }

  const unknownPids = unknownTokens(
    text,
    PID_PATTERN,
    request.telemetry.map(reading => reading.pid)
  )

  if (unknownPids.length > 0) {
    reasons.push({ kind: 'unknown-pid', pids: unknownPids })
  }

  if (authorisesDriving(normalised, request)) {
    reasons.push({ kind: 'authorises-driving' })
  }

  if (downgradesSeverity(normalised, request)) {
    reasons.push({ kind: 'downgrades-severity' })
  }

  if (containsAny(normalised, REPAIR_PROMISES)) {
    reasons.push({ kind: 'promises-a-repair' })
  }

  return reasons
}

/**
 * The codes the answer names that the request never carried, uppercased and
 * deduplicated in the order they appear.
 */
function unknownTokens(
  text: string,
  pattern: RegExp,
  known: readonly string[]
): readonly string[] {
  const permitted = new Set(known.map(item => item.toUpperCase()))
  const unknown: string[] = []

  for (const match of text.matchAll(pattern)) {
    const token = match[0].toUpperCase()

    if (!permitted.has(token) && !unknown.includes(token)) {
      unknown.push(token)
    }
  }

  return unknown
}

/**
 * The rules engine decides whether driving may continue. An answer may
 * repeat that decision — §9.3 allows summarising the local evaluation — and
 * may not exceed it.
 */
function authorisesDriving(
  normalised: string,
  request: AssistantRequest
): boolean {
  if (!containsAny(normalised, DRIVING_AUTHORISATIONS)) {
    return false
  }

  const localAction = normalise(
    request.assessment?.immediateAction ?? ''
  )

  return !containsAny(localAction, DRIVING_AUTHORISATIONS)
}

/**
 * Only a `critical` severity is protected. §9.4 names it specifically, and
 * an answer that plays down a warning is a tone question, not a safety one.
 */
function downgradesSeverity(
  normalised: string,
  request: AssistantRequest
): boolean {
  return request.assessment?.severity === 'critical'
    && containsAny(normalised, SEVERITY_DOWNGRADES)
}

function containsAny(
  normalised: string,
  phrases: readonly string[]
): boolean {
  return phrases.some(phrase => normalised.includes(phrase))
}

/** Lowercases, strips accents and collapses whitespace. */
function normalise(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}
