# ADR-013: Fase 3 closed as an MVP, with no AI provider deployed

**Status**: Accepted
**Date**: 2026-09-01
**Decided by**: Kristian (project owner)
**Related**: [ADR-010](ADR-010-fase-3-opening.md), [ADR-011](ADR-011-wake-word-viability-gate.md), [ADR-012](ADR-012-on-device-speech.md), [ADR-004](ADR-004-part-a-closure.md), `docs/PHASE_ROADMAP.md`, `docs/ASSISTANT_REMOTE_PROVIDER.md`, `docs/SPEECH_DEVICE_VALIDATION.md`, spec §3, §3.1, §9, §15.3, RF-030, RF-032, RF-033, RNF-006

## Decision

Fase 3 (**Voice and AI**) is closed as of 2026-09-01. Its exit criterion is
met with **no AI provider, no model key and no backend of any kind deployed**.
Choosing and deploying a real provider is a later deployment decision, not a
Fase 3 work item.

The reasoning is the one RNF-006 forces. A static Capacitor APK cannot hold a
model key, so the AI half of this phase can only ever be a seam the client
speaks to — the provider lives behind an HTTPS URL somebody deploys. The spec
asks Fase 3 for a **swappable** provider, output validation and a temporary
local fallback. It does not ask for a subscription.

## What §3 required, and what backs each part

Exit criterion (§3): *"Push-to-talk, transcripción, respuestas estructuradas,
proveedor de IA intercambiable, validación de salida y fallback local
temporal."*

| Required | Backed by | Evidence class |
|---|---|---|
| Push-to-talk | RF-030 tap-to-start/tap-to-stop dictation in `AssistantCommandBar` | **Device.** `SPEECH_DEVICE_VALIDATION.md` checks 7 and 9, installed APK |
| Transcription | Web Speech recognizer, no native bridge needed | **Device.** Checks 7 and 8 — a real transcript, online and offline |
| Structured responses | `composeLocalAnswer`, §9's FORMATO DE RESPUESTA and its order | **Device.** Check 9: typed *"que significa esto"* opened the structured panel on a Pixel 9a |
| Swappable AI provider | `AssistantProvider` injection point; `createRemoteAssistantProvider` behind `NUXT_PUBLIC_ASSISTANT_ENDPOINT_URL` | **Real HTTPS transport.** `test/integration/remoteAssistantSeam.test.ts`, eight cases against a loopback dummy endpoint |
| Output validation | `validateAssistantResponse` (RF-033) — unknown DTC/PID, driving authorisation, severity downgrade, repair promise | **Real HTTPS transport.** An endpoint answer naming an unsent `P0420` was discarded for the local template |
| Temporary local fallback | `resolveAssistantAnswer` falls back on every failure class | **Device.** Check 9 observed `Fallback local` and *"sin proveedor de IA configurado"* on the phone |

Definition of done (§15.3): *"Consulta por voz/texto con fallback y respuesta
estructurada."* Both entry paths exist in one code path — `AssistantCommandBar`
sends anything `parseQuickCommand` does not match to `answerAssistantQuery` —
and the typed half is confirmed on the device.

## What "swappable provider" is allowed to mean here

A seam with no provider behind it could be a way of declaring victory over an
interface. Two things keep it from being that.

First, the seam is exercised over a **real HTTPS connection** with the
provider's own `globalThis.fetch`, not an injected fake: a request that
survives serialisation, a parsed response, a status code, a payload without
`text`, unparseable bytes, a timeout and a refused connection. Six of the
eight cases end in the local fallback, because the fallback is the part that
has to hold.

Second, the swap point is a function type — `AssistantProvider` — that the
resolver already accepts from its caller. The remote adapter is one
implementation of it and the local template is what runs when there is none.

What this does **not** claim is a second live provider. Nobody has pointed
this app at OpenAI, Anthropic or anything else, and until somebody does,
"intercambiable" is proven by the injection point and the dummy, not by a
migration.

## What this closure does NOT close

Naming these is the point of the ADR; a closure that hides them is worth less
than an open phase.

1. **No spoken free-form question has reached the assistant panel on the
   phone.** Check 9 drove spoken *quick commands* and a *typed* free-form
   question. The spoken-unknown path — dictate a question, get the structured
   local answer — is wired and unit-tested, and was not rerun on the device
   after the tap-to-dictate change.
2. **The remote seam has never run inside the Android WebView.** The evidence
   above is Node's fetch. Certificate validation was disabled for the loopback
   dummy, and CORS cannot be exercised by a same-process server. Both are
   deployment concerns and both are unproven.
3. **§9's "sistema relacionado" is still missing** from the structured answer.
   `DiagnosticAssessment` carries §8.2's eight fields; the subsystem lives on
   `DtcCatalogEntry`. The gap is named in `composeLocalAnswer` rather than
   filled by inferring a system from a code prefix.
4. **ADR-004's A2 waiver stays open.** The post-fix Bluetooth-toggle recovery
   has still never run on the car. Fase 3 inherited it from ADR-010 and hands
   it to whatever comes next; closing Fase 3 does not close it.
5. **Check 4 remains opportunistic** — an assessment announcing itself in the
   car needs a stored fault this read-only project will not induce.
6. **The wake word is untouched.** ADR-011 gates it, spec §11 says *"Sin
   palabra de activación en el MVP"*, and nothing here changes either.

## How we would know this was the wrong call

If a real provider is deployed later and the seam needs reshaping to accept it
— a streaming response, a different envelope, an auth header the client must
send — then closing on a dummy endpoint bought less than it appeared to. The
auth-header case is the one to watch: RNF-006 forbids a client secret, so a
provider that demands one from the APK invalidates the deployment shape, not
just the seam.

The other way this turns out wrong is the WebView. If `fetch` to a public
HTTPS endpoint behaves differently inside the Capacitor container than it does
in Node — as `window.speechSynthesis` did — then gap 2 above was the real work
and this ADR closed the phase one experiment too early.

## Consequences

- Fase 3 is closed. Under §3.1, Fase 4 (**Convex and maintenance**) is now
  legal to open. This ADR does not open it.
- The APK continues to ship with no AI dependency, no model key and no Nitro
  `/api` route. `NUXT_PUBLIC_ASSISTANT_ENDPOINT_URL` absent is a supported
  configuration, not a degraded one.
- Deploying a provider endpoint is future work governed by
  `docs/ASSISTANT_REMOTE_PROVIDER.md`, and it does not reopen this phase.
- The six gaps above are carried forward as named debt, exactly as ADR-010
  carried ADR-004's waiver.
