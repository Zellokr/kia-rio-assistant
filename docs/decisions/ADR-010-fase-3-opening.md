# ADR-010: Fase 3 opened with one carried waiver and one unmet criterion resolved

**Status**: Accepted
**Date**: 2026-08-28
**Decided by**: Kristian (project owner)
**Related**: [ADR-003](ADR-003-fase-1-closure-waiver.md), [ADR-004](ADR-004-part-a-closure.md), [ADR-011](ADR-011-wake-word-viability-gate.md), `docs/PHASE_ROADMAP.md`, `docs/FIELD_TEST_VEHICLE_VALIDATION.md`, spec §3, §3.1, §15.3, RF-030, RF-031

## Decision

Fase 3 (**Voice and AI**) is open as of 2026-08-28.

Spec §3.1 states that a phase does not start until the previous one has
reproducible tests **and** a verified exit criterion. This ADR records that
the rule was checked rather than assumed, and what was found on each side of
it — one waiver carried forward, and one criterion that was genuinely unmet
and is resolved by work rather than by waiving it.

## What §3.1 required, and what was actually found

### Fase 1 — verified, minus one named path

A1 met its criterion on vehicle evidence: eleven consecutive connections, no
errors, 7.7–10.4 s to ready with no drift across the run. A2 closed on a
narrow owner waiver in ADR-004 — two drops were detected and one recovery
observed.

The gap ADR-004 waives is specific and stays open here: the second drop was a
Bluetooth toggle and did not recover. Root cause is understood and fixed in
`8c88f1d` and `7b2792d`, and both fixes are covered by tests, but **neither
has been run against the car**. Opening Fase 3 carries that waiver forward; it
does not close it.

### Fase 2 — one exit criterion was unmet, and was not recorded anywhere

Fase 2's exit criterion (§3) reads: *"Reglas de gravedad, catálogo de DTC,
identificación guiada de testigos, **TTS local** y registro de sesión."*
RF-031 makes short TTS with a mute control a MUST.

There is no TTS in the repository. A search across `.ts` and `.vue` sources
for `speechSynthesis`, `SpeechRecognition` and `utterance` returns nothing,
and the Android manifest declares no `RECORD_AUDIO` permission. This was not
recorded in `docs/SPEC_DEVIATIONS.md`, so it was an unnoticed gap rather than
an accepted deviation.

**This is not waived.** TTS local is the first work item of Fase 3. Fase 3
needs a speech output path for its own exit criterion anyway, so building it
at the front of Fase 3 satisfies Fase 2's criterion with the same work rather
than duplicating it. Fase 2 is therefore closed on delivery of that item, not
on this ADR.

## Why the Fase 1 waiver is acceptable here

§3.1's second sentence names the failure it exists to prevent: *"Nuxt, Convex,
voz e IA no deben utilizarse para ocultar una conexión OBD inestable."*

That is not the situation. The OBD link is now the best-evidenced part of the
stack: twenty-one recorded sessions across two vehicle runs, reconnection
proven against the real car rather than only against `ReplayObdTransport` and
fake timers, and persistence proven in the real Android WebView rather than
only against `fake-indexeddb`. Voice and AI are not being used to paper over
an unstable connection; the connection is the part with the most evidence
behind it.

The residual risk is one recovery path on hardware that may not be available
again soon. Blocking a single-person project's remaining MUST phases on it
buys less than it costs.

## How we would know this was the wrong call

If any future vehicle session fails in a way that resembles the Bluetooth
toggle path, or fails in a way that smells like session duration, Fase 3 work
stops and the vehicle run takes priority over further feature work. The
long-soak gap that the shortened A2 session left open
(`docs/FIELD_TEST_VEHICLE_VALIDATION.md`) is the other place this decision
could turn out wrong.

## Consequences

- Fase 3 delivers **voice and AI together**, as one phase. Its scope is the
  §3 exit criterion and §15.3 definition of done, not a scope renegotiated
  once work begins.
- Activation for the MVP stays push-to-talk per RF-030. The "hey kirio" wake
  word is handled separately in [ADR-011](ADR-011-wake-word-viability-gate.md)
  and is **not** part of Fase 3's scope.
- TTS local (RF-031) is Fase 3's first work item and closes Fase 2.
- ADR-004's A2 waiver stays open and is inherited by Fase 3 rather than
  resolved by it.
