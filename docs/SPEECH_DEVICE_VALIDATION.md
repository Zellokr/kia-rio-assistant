# Speech device validation

**Status: NOT RUN.** Nothing below has been executed on the phone. The TTS
code is written, unit-tested and shipped; whether the platform engine is
reachable from inside the Capacitor WebView is still an open question.

[ADR-012](decisions/ADR-012-on-device-speech.md) puts speech on the device's
own engines and states plainly that it does **not** assume those engines are
reachable from the Web Speech APIs in this shell. This document is where that
assumption gets tested. Until check 1 runs, the honest status of Fase 2's
`TTS local` exit criterion is *coded, unverified* — see
[`PHASE_ROADMAP.md`](PHASE_ROADMAP.md).

> **Why this file exists.** `WebSerialRfcommTransport` was written and
> unit-tested against a browser API that does not exist inside the Android
> WebView, then deleted without ever running on hardware
> (`SPEC_DEVIATIONS.md`, deviation 1). Passing unit tests said nothing about
> that, and they say nothing about this either: every speech test in the suite
> runs against an injected fake host. **The phone is the only thing that can
> answer check 1.**

No car is needed for checks 1–3. Only check 4 wants the vehicle.

## Quick path

1. Install the debug APK on the phone and open the app.
2. Run check 1. It takes ten seconds and it decides everything else.
3. Record the outcome in the table at the bottom, including a failure.

## Check 1 — Is the platform speech engine reachable?

**The whole question.** Press the round button in the bottom-right corner. It
is on every screen and starts off.

The button proves the engine by *using* it, so its own state is the result —
there is nothing to read off a debug panel:

| What happens | What it means | Status to record |
|---|---|---|
| It spins briefly, then shows a **waveform with a pulsing halo**, and you hear **"Voz activada"** | The Web Speech API is reachable and works in this WebView. No native bridge needed for TTS. | PASS |
| It turns **red** with a crossed-out speaker, and a toast names a reason | Reachable or absent, but not usable. **The reason is the finding** — copy it verbatim. | FAIL, with reason |
| It **spins and never settles** | The engine accepted the utterance and never made a sound. It gives up after 8 s and turns red. | FAIL |
| Nothing happens at all | Not a speech result — the button did not receive the tap. Report as a UI defect, not a speech one. | INVALID |

**Record the reason text exactly.** The two failures that matter are
distinguishable only by their wording:

- *"speechSynthesis no existe en este WebView…"* — the API is absent, and TTS
  needs a Capacitor bridge to the platform engine. This is the ADR-012
  option-2 outcome, and it is a real possibility, not a bug.
- *"…no hay voces instaladas…"* — the API is present and the phone has no
  Spanish voice. This is a device setup problem, **not** a code problem. Fix
  it in Android settings and rerun before recording a failure.

## Check 2 — Does it come out in Spanish?

Only meaningful if check 1 passed. Listen to *"Voz activada"*.

The utterance is tagged `es-ES`. If the phone reads it with an English accent,
the tag was ignored or no Spanish voice is installed — record which, because
every string this app speaks is Spanish and an English engine mispronouncing
diagnostics is a usability failure, not a cosmetic one.

## Check 3 — Does silencing actually silence?

RF-031 is only accepted if *"el usuario puede usar la app sin audio"*.

1. With the voice on, read stored DTCs and let it start speaking.
2. Press the button **while it is talking**.
3. The audio must stop immediately, mid-sentence, and the button must return
   to the crossed-out speaker.

A cut that only takes effect after the sentence finishes is a FAIL: the point
of the control is to shut the app up now.

## Check 4 — Does an assessment announce itself in the car? *(needs the vehicle)*

The only check that needs the Kia Rio, and it is opportunistic: it needs a
stored fault, which this project will not induce.

With the engine running, the adapter connected and the voice on, read stored
DTCs. Expect **one** short utterance carrying severity and the immediate
action, then silence:

- Reading again with the same result must say **nothing** — that is §11's
  *"sin repetición agresiva"*.
- An unconfirmed finding must be spoken as *"sin confirmar"*. If a low
  confidence assessment is announced without that hedge, it is a defect.
- An informational assessment must say nothing at all.

## What is NOT covered here

- **STT / speech recognition.** Not built. `detectSpeechCapability` reports
  whether a `SpeechRecognition` constructor exists, but nothing surfaces that
  yet and a constructor proves nothing on its own — only a real `start()`
  does. The `RECORD_AUDIO` permission is deliberately still absent from the
  manifest.
- **The wake word.** Out of scope by
  [ADR-011](decisions/ADR-011-wake-word-viability-gate.md); it has its own
  gate.
- **§11's detailed-while-parked speech.** Needs the driving mode, which does
  not exist.

## Results

| Check | Date | Outcome | Notes |
|---|---|---|---|
| 1 — engine reachable | — | NOT RUN | |
| 2 — Spanish voice | — | NOT RUN | |
| 3 — silencing | — | NOT RUN | |
| 4 — assessment in the car | — | NOT RUN | Opportunistic; needs a stored fault |
