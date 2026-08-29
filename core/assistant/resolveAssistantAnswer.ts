import type { AssistantRequest } from './buildAssistantRequest'
import { composeLocalAnswer } from './composeLocalAnswer'
import { validateAssistantResponse } from './validateAssistantResponse'
import type {
  AssistantRejectionReason
} from './validateAssistantResponse'

/**
 * The single path from a question to an answer, and the reason RF-033's
 * acceptance holds: "un error externo no impide responder".
 *
 * The requirement has two halves and this function is where they meet.
 * "Validar **siempre** la respuesta de IA" means no caller may reach the
 * provider without passing through validation, so callers are given this and
 * not `validateAssistantResponse` — the check is not something a screen can
 * forget. "Utilizar una plantilla local **únicamente** como fallback
 * temporal" means the template is what happens when the answer does not
 * arrive or does not hold up, never the preferred output.
 *
 * Four things can go wrong outside this device, and all four end in an
 * answer rather than an error:
 *
 * - No provider is wired at all — §9.5's modo degradado, the offline case.
 * - The provider fails: HTTP error, network drop, malformed reply.
 * - The provider never answers. A hang is the most common external failure
 *   and the one most likely to be forgotten, so the deadline lives here
 *   rather than in an adapter that may never enforce it.
 * - The provider answers and the answer breaks §9.4.
 *
 * The last case is the one worth being clear about: a rejected answer is
 * **discarded, not repaired**. There is no editing pass that strips the
 * offending sentence, because a corrected answer is one nothing validated.
 * The local template is a worse read and a claim the rules engine stands
 * behind, which is the right trade when the alternative is an unfounded
 * statement to someone deciding whether to keep driving.
 *
 * `reasons` always says why the template is on screen. A silent degradation
 * looks identical to a working assistant that has gone bland, and that is
 * how a broken provider survives for weeks unnoticed.
 */

export type AssistantProvider
  = (request: AssistantRequest) => Promise<string>

export type AssistantFallbackReason
  = | AssistantRejectionReason
    | { readonly kind: 'no-provider' }
    | { readonly kind: 'provider-failed', readonly message: string }
    | { readonly kind: 'provider-timed-out' }

export interface AssistantAnswer {
  /** Never empty. Something is always shown. */
  readonly text: string
  readonly source: 'ai' | 'local-template'
  /** Empty only when the AI answered and the answer validated. */
  readonly reasons: readonly AssistantFallbackReason[]
}

export interface ResolveAssistantAnswerInput {
  readonly request: AssistantRequest
  /** Absent while offline, and until a provider adapter exists at all. */
  readonly ask?: AssistantProvider | null
  readonly timeoutMs?: number
}

/**
 * How long a driver waits before the local answer is simply better than a
 * later one. Matches the order of magnitude of the rest of the stack — an
 * ELM command gives up at 3000 ms — with room for a round trip to a model.
 */
export const ASSISTANT_PROVIDER_TIMEOUT_MS = 8000

/**
 * Shown when there is no AI **and** nothing has been read from the vehicle,
 * so there is no evaluation to write a template from. An empty report would
 * read as "everything is fine", which is a claim nobody made.
 */
const NO_EVIDENCE_ANSWER
  = 'Todavía no hay ninguna lectura del vehículo, así que no puedo '
    + 'responder por mi cuenta. Conecta el adaptador y lee los códigos '
    + 'para obtener una evaluación local.'

export async function resolveAssistantAnswer(
  input: ResolveAssistantAnswerInput
): Promise<AssistantAnswer> {
  if (!input.ask) {
    return fallback(input.request, [{ kind: 'no-provider' }])
  }

  const attempt = await askProvider(
    input.ask,
    input.request,
    input.timeoutMs ?? ASSISTANT_PROVIDER_TIMEOUT_MS
  )

  if (attempt.kind !== 'answered') {
    return fallback(input.request, [attempt.reason])
  }

  const validation = validateAssistantResponse(
    attempt.text,
    input.request
  )

  return validation.outcome === 'accepted'
    ? {
        text: validation.text,
        source: 'ai',
        reasons: []
      }
    : fallback(input.request, validation.reasons)
}

type ProviderAttempt
  = | { readonly kind: 'answered', readonly text: string }
    | {
      readonly kind: 'failed'
      readonly reason: AssistantFallbackReason
    }

async function askProvider(
  ask: AssistantProvider,
  request: AssistantRequest,
  timeoutMs: number
): Promise<ProviderAttempt> {
  let expire: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<ProviderAttempt>((resolve) => {
    expire = setTimeout(
      () => resolve({
        kind: 'failed',
        reason: { kind: 'provider-timed-out' }
      }),
      timeoutMs
    )
  })

  try {
    return await Promise.race([
      answerOrFailure(ask, request),
      deadline
    ])
  } finally {
    // A won race leaves the loser's timer pending. Clearing it keeps a
    // resolved query from holding the event loop open.
    clearTimeout(expire)
  }
}

async function answerOrFailure(
  ask: AssistantProvider,
  request: AssistantRequest
): Promise<ProviderAttempt> {
  try {
    return {
      kind: 'answered',
      text: await ask(request)
    }
  } catch (error) {
    return {
      kind: 'failed',
      reason: {
        kind: 'provider-failed',
        message: describeFailure(error)
      }
    }
  }
}

/**
 * A provider may reject with anything. The message is kept because it is
 * what a field report needs; the error object is not, because it carries a
 * stack and whatever else the transport attached to it.
 */
function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return typeof error === 'string'
    ? error
    : 'El proveedor de IA falló sin indicar un motivo'
}

function fallback(
  request: AssistantRequest,
  reasons: readonly AssistantFallbackReason[]
): AssistantAnswer {
  return {
    text: request.assessment
      ? composeLocalAnswer(request.assessment)
      : NO_EVIDENCE_ANSWER,
    source: 'local-template',
    reasons
  }
}
