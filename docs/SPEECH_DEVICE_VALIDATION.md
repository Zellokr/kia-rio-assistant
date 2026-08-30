# Speech device validation

**Status: measured on 2026-08-29. The two halves of the Web Speech API
disagree on this device, and that is the headline.**

| | Result | Consequence |
|---|---|---|
| **Synthesis (TTS)** | `window.speechSynthesis` **does not exist**, but the native Capacitor Android `TextToSpeech` bridge **works on the phone** (checks 1, 2 and 3) | Fase 2's `TTS local` exit criterion is met through the native bridge. Web Speech remains only the browser fallback. |
| **Recognition (STT)** | Constructor present, a real `start()` **worked**, works **offline**, and drove quick commands through `parseQuickCommand` on device (checks 6, 7, 8 and 9) | **No bridge needed, no network needed.** Push-to-talk is wired through the Web Speech recognizer while the text command bar remains the fallback. |

Nobody predicted the split. The expectation going in was that both would be
missing together, because they are one API; measuring cost ten seconds each
time and overturned that twice.

The TTS result is [ADR-012](decisions/ADR-012-on-device-speech.md)'s option 2
becoming the actual path, not a defect: that ADR put speech on the device's
own engines and stated plainly that it did **not** assume those engines were
reachable from the Web Speech APIs in this shell. For synthesis they are not.
For recognition they are. See [`PHASE_ROADMAP.md`](PHASE_ROADMAP.md).

> **Why this file exists.** `WebSerialRfcommTransport` was written and
> unit-tested against a browser API that does not exist inside the Android
> WebView, then deleted without ever running on hardware
> (`SPEC_DEVIATIONS.md`, deviation 1). Passing unit tests said nothing about
> that, and they say nothing about this either: every speech test in the suite
> runs against an injected fake host. **The phone is the only thing that can
> answer check 1.**

Only check 4 wants the vehicle. Every other check runs on the phone alone.

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
| It spins briefly, then shows a **waveform with a pulsing halo**, and you hear **"Voz activada"** | The selected speech engine works. In the Android app this now means the native `TextToSpeech` bridge reached audio start; in a browser it means Web Speech worked. | PASS |
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

## Check 5 — Do the button icons render in the WebView?

Not a speech question, but it is answered by the same session and it costs
one glance.

The floating buttons must show a glyph, not an empty circle: a crossed-out
speaker on the voice toggle, a speech bubble on the command bar above it.

**Why it is worth a check.** Nuxt Icon paints glyphs with an unprefixed
`mask-image`, and the built CSS contains no `-webkit-mask` declaration at all.
Desktop Chrome renders this correctly — verified. Whether every Android
WebView version does is **unverified**, and a blank circle would look like a
missing icon rather than a CSS support gap, which is a bad thing to debug
later from memory.

If the circles are blank, the icons are not the bug — the mask is.

## Check 6 — Is the recognition engine there either?

Added on 2026-08-29, after check 1 failed. Android's WebView omitting
synthesis makes recognition's absence very likely — they are the same Web
Speech API — but likely is not measured, and this project does not record
inferences as results. Push-to-talk is the next thing to be designed, so the
inference has to become a reading first.

Open **Registro**. At the top is *Motor de voz del dispositivo*, which runs
`detectSpeechCapability` against the live `window` and prints both engines.
Record the two status lines verbatim:

- **Reconocimiento (STT): ausente** — recognition needs a native Capacitor
  bridge too, and the push-to-talk button must be built on that bridge rather
  than on `SpeechRecognition`.
- **Reconocimiento (STT): alcanzable** — the constructor exists. This is
  *not* a pass: only a real `start()` distinguishes a working recognizer from
  one that throws or is denied on first use. It means the bridge question is
  open for STT, not that STT works.

**Read on 2026-08-29: `alcanzable (estándar)`, with synthesis absent.** The
two halves of the same Web Speech API do not agree on this device, and the
expectation going in — that recognition would be missing alongside synthesis
— was wrong. That is the entire justification for this check existing: the
inference was reasonable, cheap to test, and false.

What it does **not** license is building push-to-talk on `SpeechRecognition`
and calling it done. A present constructor is compatible with a recognizer
that throws on `start()`, is denied the microphone, or reaches no service.
The next measurement is a real `start()`, and it needs `RECORD_AUDIO` in the
manifest — deliberately absent until now, so adding it is a decision to take
openly, not a line to slip in.

The panel says on screen that it proves nothing, and that line is permanent
rather than conditional on the result. *Volver a comprobar* re-runs the probe:
`getVoices()` can return an empty list before the engine finishes loading, so
a voice count of zero is worth one retry before it is written down.


## Check 7 — Does the recognizer actually start?

Added on 2026-08-29, after check 6 read `alcanzable (estándar)`. A present
constructor is compatible with a recognizer that throws, is denied the
microphone, or has no service behind it. This is the `start()` that tells
them apart, and it is the last thing standing between the project and a
push-to-talk design.

**This check needs a microphone permission that did not exist before.**
`RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` are now in the manifest. Capacitor
asks for both together: `BridgeWebChromeClient.onPermissionRequest` launches
a runtime request for the pair whenever web content asks for an
`AUDIO_CAPTURE` resource. No audio is recorded, stored or sent anywhere — the
probe shows the transcript on screen and discards it (RNF-007).

Open **Registro**. Under the capability panel is *Sonda de push-to-talk*.

1. **Hold** the button and say something short — *"lee los códigos"*.
2. Android may ask for the microphone the first time. Accept it; that dialog
   is why the start deadline is 15 s and not 3.
3. **Release.**

Record which of these happened:

| What you see | What it means | Status |
|---|---|---|
| *Escuchando*, then your words appear, `definitivo` | The Web Speech recognizer works in this WebView. Push-to-talk needs **no** native bridge. | PASS |
| `not-allowed` | The system denied the microphone. A permission problem, not an engine one — check Android settings and retry before recording it. | RETRY, then FAIL |
| `service-not-allowed` | The device offers no recognition service to this WebView. **This is the outcome that forces a native bridge for STT too.** | FAIL |
| `no-speech` | The microphone opened and heard nothing. The engine WORKS — this is a PASS for reachability. Retry while actually speaking. | PASS (engine), retry for a transcript |
| `network` | The recognizer needed the internet and had none. Not a microphone failure; retry online. | RETRY |
| *El reconocedor no llegó a abrir el micrófono* | 15 s passed with no audio start. Nothing was proven; treat as a hang, not a denial. | FAIL |

The code shown in monospace is the finding. The Spanish line under it is a
gloss for whoever is holding the phone — **report the code**, not the gloss.

**What a PASS here still does not prove.** That recognition works, not that
push-to-talk is done. The probe runs no commands: it displays the transcript
and throws it away. Wiring it to §11's vocabulary is a separate change with
its own acceptance, and RF-030's real criterion — *"la función principal no
depende del reconocimiento de voz"* — is met by the text command bar, not by
this.

## Check 8 — Does recognition still work with no Internet?

Open, and worth running before push-to-talk is designed around the recognizer.

Check 7 passed **online**. Android's speech recognition commonly reaches a
network service unless the device has an offline language pack for Spanish
installed, and the Web Speech API reports that failure as `network`. This
project cares because §9.5 defines a degraded mode for exactly this: no
Internet, local rules and catalogue still answering.

Voice is not on RNF-004's list of what must survive offline, so a `network`
result here is **not** a defect. It is a scope fact that belongs in the
push-to-talk design rather than being discovered by a driver in a tunnel.

1. Turn off mobile data and Wi-Fi. Re-enable Bluetooth if you also want the
   adapter; airplane mode switches it off.
2. Hold the probe and speak.
3. Record the transcript, or the code.

**Ran 2026-08-29: PASS.** The transcript came back `definitivo` with no
network at all, so this device carries an offline Spanish recognition pack.
Push-to-talk therefore works in a tunnel, in a car park, and with the phone's
data switched off.

**One caveat that belongs in the design, not in a bug report.** That pack is
a property of *this* phone, not of Android. Another device without it returns
`network`, and the app must degrade rather than look broken: the voice path
has to keep the text command bar reachable and say plainly that recognition
needs a connection on that device. RF-030's own acceptance already points the
same way — *"la función principal no depende del reconocimiento de voz"*.

## What is NOT covered here

- **A wake word.** Out of scope by
  [ADR-011](decisions/ADR-011-wake-word-viability-gate.md); it has its own
  gate.
- **§11's detailed-while-parked speech.** Needs the driving mode, which does
  not exist.
- **Spoken rerun of the later assistant fallback panel.** Check 9 validated
  quick-command routing and negative cases on the installed APK. The later
  local structured-answer fallback has now been rerun on the phone for typed
  unknown text by ADB automation, and the tap-to-toggle dictation control was
  owner-confirmed on the Pixel 9a with the spoken command *"temperatura"*.
  A fresh spoken unknown transcript still should not execute an OBD command.

## Results

| Check | Date | Outcome | Notes |
|---|---|---|---|
| 1 — engine reachable | 2026-08-29 | **PASS via native bridge** | Owner-reported APK validation: the native Android `TextToSpeech` bridge works perfectly on the phone. Historical finding preserved: the Web Speech path failed because `window.speechSynthesis` was undefined in this Capacitor WebView. |
| 2 — Spanish voice | 2026-08-29 | **PASS via native bridge** | Owner-reported together with check 1: *"Voz activada"* is spoken by the device TTS path. |
| 3 — silencing | 2026-08-29 | **PASS via native bridge** | Owner-reported together with check 1: the voice control works as expected, including cancelling/silencing. |
| 4 — assessment in the car | — | NOT RUN | Opportunistic; needs a stored fault. The native bridge is no longer the blocker. |
| 5 — icons render | 2026-08-29 | **PASS** | Every glyph draws: the five bottom-bar icons, the crossed-out speaker on the voice toggle and the speech bubble on the command bar. The unprefixed `mask-image` concern does not bite on this WebView. |
| 6 — recognition present | 2026-08-29 | **Síntesis (TTS): ausente. Reconocimiento (STT): alcanzable (estándar).** Voces instaladas: 0. | The two engines diverge, which no one predicted: synthesis is missing and recognition's constructor is present, unprefixed. Not a pass — see below. |
| 7 — recognizer starts | 2026-08-29 | **PASS** | Held the probe and said *"esto es una prueba"*. The transcript came back marked `definitivo`, with no error code. The Web Speech recognizer works in this WebView and **STT needs no native bridge**. |
| 8 — recognizer without Internet | 2026-08-29 | **PASS** | With data and Wi-Fi off (owner-reported), the probe returned *"hola esto es otra prueba hablando sin conexión"* marked `definitivo`. This phone has an offline Spanish recognition pack. |
| 9 — speech transcript executes quick commands | 2026-08-29; Pixel 9a reruns 2026-08-30 | **PASS** | USB/ADB-assisted device validation on the installed APK. Holding **Dictar comando** and speaking quick-command phrases drove the same `parseQuickCommand` path as text: *"temperatura"* moved to the data view, *"estado"* moved to the connection view, *"testigo"* moved to warning lights, and *"códigos"* moved to diagnostics/DTC. Negative cases also held: *"nota"* showed *"Guardar notas todavía no está disponible"*, and *"radio"* did not execute a command. After the later local assistant fallback wiring, ADB automation on a Pixel 9a confirmed typed *"que significa esto"* opens the structured local answer panel with `Fallback local` and `sin proveedor de IA configurado`, and a subsequent deterministic *"Temperatura"* command clears that stale answer while navigating to live data. The original press-and-hold dictation UX ended too quickly on the Pixel 9a, so it was changed to tap-to-start/tap-to-stop; the owner then confirmed spoken *"temperatura"* works. A fresh spoken-unknown fallback path was not rerun. The text command bar remains the non-voice fallback. |

