import type { QuickCommandIntent } from './parseQuickCommand'
import type {
  DiagnosticAssessment
} from '../obd/diagnostics/assessDiagnostics'
import { metricAgeMs, isMetricStale } from '../obd/telemetry/metricFreshness'
import type {
  ObdTelemetryMetric
} from '../obd/telemetry/ObdTelemetryStore'

/**
 * Assembles the one payload that leaves the device for the AI provider.
 *
 * RF-032 (MUST) asks for "una evaluación estructurada y los datos mínimos
 * necesarios para interpretar la consulta", and it is accepted only if "la
 * petición no contiene el historial completo ni audio". Both halves of that
 * acceptance are enforced structurally here rather than trusted to callers:
 *
 * - **No audio.** There is no field for it. Speech reaches this function as
 *   a transcript, the same shape typed text arrives in, so the audio never
 *   exists at this layer to be forwarded. RNF-007 also makes audio
 *   non-persistent, and the cheapest way to keep a promise about data is to
 *   never hold it.
 * - **No full history.** The caller hands over whatever it has and this
 *   function truncates, so forgetting the bound is not something a call site
 *   can do. What was dropped is reported in `omissions`, because a model
 *   that does not know the conversation was cut will happily invent the
 *   continuity — and §9.4 forbids inventing.
 *
 * This is a pure builder. It performs no request, holds no key and knows no
 * provider: RNF-006 keeps AI keys out of the client bundle, so the transport
 * belongs to a server-side seam that does not exist yet. What exists is the
 * decision about *what may be sent*, which is the part worth fixing in tests
 * before any provider is chosen.
 *
 * **Not sent, on purpose.** The vehicle is a constant of this project (Kia
 * Rio YB 2019 1.2 MPI); it belongs in the provider adapter's system prompt,
 * not in a per-request payload that pays for it every turn. The vehicle
 * fingerprint identifies the adapter and the car, and nothing in §9.3 needs
 * it. Neither VIN nor location is collected anywhere in this app (RNF-007),
 * so there is nothing here to withhold — only a field never to add.
 */

export interface AssistantQuery {
  /**
   * What the driver typed, or what speech recognition transcribed. Never
   * audio: by the time it reaches here it is text or it does not travel.
   */
  readonly text: string
  /**
   * The quick command the text matched, when it matched one. `null` is the
   * ordinary case for an open question — which is precisely the case the AI
   * exists to answer.
   */
  readonly intent: QuickCommandIntent | null
}

export interface AssistantTurn {
  readonly role: 'user' | 'assistant'
  readonly text: string
}

/** A reading recent enough to be a claim about now. */
export interface AssistantTelemetryReading {
  readonly key: string
  readonly pid: string
  readonly label: string
  readonly value: number
  readonly unit: string
  /**
   * How old the reading is. `latencyMs` is deliberately dropped: it
   * describes the adapter's round trip, not the vehicle, and there is
   * nothing the AI may say about it.
   */
  readonly ageMs: number
}

/**
 * What the payload does not carry, and why.
 *
 * Sent with the request rather than logged locally. The AI needs to know
 * that the conversation was cut and that a value was withheld; withholding
 * silently is how a model fills the gap with something plausible.
 */
export type AssistantOmission
  = | {
    readonly kind: 'history-truncated'
    readonly droppedTurns: number
  }
  | {
    readonly kind: 'stale-telemetry'
    readonly keys: readonly string[]
  }

export interface AssistantRequest {
  readonly query: AssistantQuery
  /** `null` before anything has been read from the vehicle. */
  readonly assessment: DiagnosticAssessment | null
  readonly telemetry: readonly AssistantTelemetryReading[]
  readonly recentTurns: readonly AssistantTurn[]
  readonly omissions: readonly AssistantOmission[]
}

export interface AssistantRequestInput {
  readonly query: AssistantQuery
  readonly assessment?: DiagnosticAssessment | null
  /** Everything the store holds; this function decides what survives. */
  readonly telemetry?: readonly ObdTelemetryMetric[]
  /** The whole conversation; this function decides how much travels. */
  readonly history?: readonly AssistantTurn[]
  readonly nowMs: number
}

/**
 * The top-level shape of the payload, as data.
 *
 * Exported so a test can assert the built request has these fields and no
 * others. The point is not tidiness: this is the guard that fails when
 * someone later adds an `audio`, a `vin`, a `location` or a raw session log
 * to a request that RF-032 and RNF-007 say must not carry them.
 */
export const ASSISTANT_REQUEST_FIELDS = [
  'query',
  'assessment',
  'telemetry',
  'recentTurns',
  'omissions'
] as const

/**
 * Six turns is three exchanges: enough for "¿y eso es grave?" to resolve
 * against what was just said, and plainly not the full history RF-032
 * excludes. A longer window buys context the local assessment already
 * supplies — the facts live in `assessment`, not in the chat.
 */
export const MAX_ASSISTANT_HISTORY_TURNS = 6

export function buildAssistantRequest(
  input: AssistantRequestInput
): AssistantRequest | null {
  const text = input.query.text.trim()

  if (text.length === 0) {
    return null
  }

  const telemetry = selectFreshReadings(
    input.telemetry ?? [],
    input.nowMs
  )

  const history = input.history ?? []
  const recentTurns = history
    .slice(-MAX_ASSISTANT_HISTORY_TURNS)
    .map(turn => ({ role: turn.role, text: turn.text }))

  return {
    query: {
      text,
      intent: input.query.intent
    },
    assessment: input.assessment ?? null,
    telemetry,
    recentTurns,
    omissions: collectOmissions(
      history.length - recentTurns.length,
      staleKeys(input.telemetry ?? [], input.nowMs)
    )
  }
}

function selectFreshReadings(
  metrics: readonly ObdTelemetryMetric[],
  nowMs: number
): readonly AssistantTelemetryReading[] {
  return metrics
    .filter(metric => !isMetricStale(metric, nowMs))
    .map(metric => ({
      key: metric.key,
      pid: metric.pid,
      label: metric.label,
      value: metric.value,
      unit: metric.unit,
      // Fresh by the filter above, so the age is always readable here.
      ageMs: metricAgeMs(metric, nowMs) ?? 0
    }))
}

function staleKeys(
  metrics: readonly ObdTelemetryMetric[],
  nowMs: number
): readonly string[] {
  return metrics
    .filter(metric => isMetricStale(metric, nowMs))
    .map(metric => metric.key)
}

function collectOmissions(
  droppedTurns: number,
  stale: readonly string[]
): readonly AssistantOmission[] {
  const omissions: AssistantOmission[] = []

  if (droppedTurns > 0) {
    omissions.push({
      kind: 'history-truncated',
      droppedTurns
    })
  }

  if (stale.length > 0) {
    omissions.push({
      kind: 'stale-telemetry',
      keys: stale
    })
  }

  return omissions
}
