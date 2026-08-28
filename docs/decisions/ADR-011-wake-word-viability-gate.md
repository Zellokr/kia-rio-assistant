# ADR-011: "hey kirio" wake word goes through a viability gate, not into Fase 3

**Status**: Accepted
**Date**: 2026-08-28
**Decided by**: Kristian (project owner)
**Related**: [ADR-002](ADR-002-obd-transport.md), [ADR-010](ADR-010-fase-3-opening.md), `docs/SPEC_DEVIATIONS.md` (deviation 1), spec §11, §3.1 "Puerta de decisión de la Fase 0", RF-030

## Decision

The owner wants activation by wake word — *"hey kirio"* — instead of
push-to-talk.

That change is **not** adopted into Fase 3. Fase 3 ships push-to-talk per
RF-030. The wake word gets its own viability gate first, modelled on the
spec's own Fase 0 decision gate: a throwaway lab page that tries only to
detect the wake word on the real device, with an exit criterion decided before
it is built.

If the gate passes, the wake word is promoted and recorded as a deviation
against §11. If it fails, the cost is one lab page instead of a phase built on
an assumption.

## What the spec says

Spec §11, "Activación":

> Botón grande mantener para hablar o pulsar para iniciar/detener.
> **Sin palabra de activación en el MVP.**

RF-030 (MUST): *"Ofrecer push-to-talk y entrada de texto equivalente"*, with
acceptance *"La función principal no depende del reconocimiento de voz."*

The absence of a wake word is an explicit exclusion written on 2026-08-06, not
an omission. Overriding it is the owner's call, but it is a change to a stated
decision and needs evidence rather than preference behind it.

## Why a gate and not just an implementation

This project has already made this exact mistake once, and it is recorded in
its own `SPEC_DEVIATIONS.md` as deviation 1.

Web Serial/RFCOMM was written into the spec as the primary Android transport.
`WebSerialRfcommTransport` was implemented and unit-tested against a fake
port. It was then **deleted without ever running on the vehicle**, because
native Web Serial does not exist on Android inside the Capacitor WebView. The
browser API had been assumed available in an environment that never had it,
and the work built on that assumption was thrown away.

A wake word has the same shape:

- `SpeechRecognition` is a Chrome feature, not a WebView one. The app is a
  Capacitor Android shell, which is precisely the environment where the
  Web Serial assumption already failed.
- *"hey kirio"* is a custom keyword. Picovoice Porcupine bills for custom
  keywords; openWakeWord requires training a model. Neither is free work.
- Android's own `AlwaysOnHotwordDetector` is restricted to system and
  privileged applications, which this is not.
- Continuous listening means `RECORD_AUDIO`, a foreground service, and
  sustained battery draw — held at the same time as the BLE link, in a car.
- Any of the workable paths means a second native Capacitor plugin after
  `AndroidBleBridge`.

None of these are reasons to refuse the feature. They are reasons not to
commit a MUST phase to it before a single one of them has been checked on the
actual device.

## The gate

A standalone lab page, in the same spirit as `/lab/obd` and Anexo B's Sprint 0
— no dashboard, no AI, no integration with Fase 3 work.

Questions it has to answer, on the real device, in the real Capacitor
WebView:

1. Is any speech-recognition API reachable at all from inside the WebView, or
   does this require a native plugin from the first line?
2. What detects *"hey kirio"* specifically, and what does that path cost —
   licence, model training, or bundle size?
3. Does detection survive with the BLE link connected and telemetry polling?
4. What does continuous listening do to battery over a realistic drive, and
   does Android Doze kill it?
5. What is the false-activation rate with road noise, music, and passengers?

**Exit criterion**: reliable detection of *"hey kirio"* on the vehicle with
the BLE link live, with a measured false-activation rate the owner accepts,
and a documented cost for the chosen detection path.

**On pass**: the wake word is promoted to an activation option, §11 is
recorded as deviation 5 in `docs/SPEC_DEVIATIONS.md`, and this ADR is
superseded by one recording the adoption.

**On fail**: push-to-talk stays, the finding is written down, and the wake
word moves to Fase 5 (COULD) where extensions live.

## Consequences

- Fase 3's scope is unchanged and unblocked; it does not wait on this gate.
- Push-to-talk and equivalent text input remain MUST regardless of the gate's
  outcome. RF-030's acceptance — the main function never depends on speech
  recognition — is not negotiable by this decision, because a wake word makes
  it *more* important, not less.
- The gate is scheduled by the owner, not by this ADR. It is not a blocker
  for anything currently open.
