# ADR-012: Speech stays on the device's own engines, not a bundled Whisper

**Status**: Accepted
**Date**: 2026-08-28
**Decided by**: Kristian (project owner)
**Related**: [ADR-010](ADR-010-fase-3-opening.md), [ADR-011](ADR-011-wake-word-viability-gate.md), `docs/PHASE_ROADMAP.md`, spec ADR-001 (local-first), §11, RF-030, RF-031

## Decision

Both halves of the speech stack use **the Android device's own engines**:

- **TTS** (output): the platform speech synthesis engine.
- **STT** (input): Android's on-device speech recognition.

A bundled local model — `whisper.cpp` or equivalent — is **not** adopted.

## Why

Spec ADR-001 makes the core local-first: *"Reduce dependencia de cobertura y
servicios externos."* In a moving car that is not a preference, it is a
constraint — coverage drops constantly.

Both options satisfy that constraint. Android's on-device recognition runs
without network once the Spanish language pack is installed, so local-first
does not by itself justify shipping a model. §11 already points the same way:
*"Web Speech cuando esté disponible; procesamiento local si el navegador y el
paquete de idioma lo permiten."*

What separates them is cost:

| | Android on-device | Bundled `whisper.cpp` |
|---|---|---|
| Model shipped | None — system provides it | ~75 MB (base) to 1.5 GB (large) |
| Accuracy under road noise | Weaker — the known risk | Stronger — its main advantage |
| CPU and battery | Vendor-optimized | Heavy, and competes with the live BLE link |
| Spanish | Requires the user's language pack | Multilingual natively |

The deciding argument is sequencing, not the benchmark. Committing to Whisper
means owning a model, its size, and its CPU cost **before** knowing whether
the platform recognizer is already good enough inside this specific car. Road
noise is what decides that, and no benchmark answers it from a desk.

## What is explicitly accepted as risk

- **Accuracy under road noise is the weak point**, and it is accepted
  knowingly. If the platform recognizer proves unusable at speed, this ADR is
  what gets revisited — Whisper is not ruled out forever, it is deferred until
  there is evidence it is needed.
- **Dependence on the user's Spanish language pack.** If it is missing,
  recognition degrades or requires network. The app must detect this and say
  so, rather than silently falling back to a cloud call.
- RF-030's acceptance still holds regardless: *"La función principal no
  depende del reconocimiento de voz."* Text input stays equivalent.

## The assumption this ADR does NOT make

**Whether either engine is reachable from inside the Capacitor WebView is
unverified.** `speechSynthesis` and `SpeechRecognition` are Web Speech APIs,
and this app runs in an Android WebView, not in Chrome. That is precisely the
environment where the Web Serial assumption already failed and cost a deleted
transport (`docs/SPEC_DEVIATIONS.md`, deviation 1).

So "device engine" here means the platform's engine, **not** a claim about how
it is reached. Deciding that is the first task of the TTS work item, and it
has two possible answers, both acceptable:

1. The Web Speech API works inside the WebView — use it directly.
2. It does not — reach the same platform engine through a thin Capacitor
   bridge, as `AndroidBleBridge` already does for BLE.

What is **not** acceptable is writing code against option 1 without checking
it on the device first.

## Consequences

- No model is bundled and no model-download flow is needed.
- The `RECORD_AUDIO` permission is still required for STT, and is still not in
  the manifest.
- ADR-011's viability gate is unchanged: it keeps covering the wake word only.
  The road-noise measurement it produces is, however, the same evidence that
  would trigger revisiting this ADR.
