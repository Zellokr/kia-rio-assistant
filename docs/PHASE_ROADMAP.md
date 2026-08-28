# Phase roadmap and exit criteria

The delivery plan lives in section 3 of
`docs/Especificacion_Final_Asistente_Kia_Rio_v2.0.pdf`, which is **untracked
in git** and needs a hand-written extractor to read (no poppler, pypdf,
pdfminer or pymupdf on the development machine). That made the roadmap
invisible to anyone reading the repository alone, and made it impossible to
argue about phase transitions from evidence.

This document mirrors the spec's phase table (§3), the advance rule (§3.1),
the per-phase definition of done (§15.3), and the Anexo B Sprint 0 checklist
into tracked files, and records where the project actually stands against
each one.

The mirror is reproducible. `scripts/extract-spec-pdf.py` is the extractor
used to read the PDF; run it to re-check any quote in this file:

```
python3 scripts/extract-spec-pdf.py docs/Especificacion_Final_Asistente_Kia_Rio_v2.0.pdf
```

The PDF remains the contract. This is a faithful mirror, not a replacement:
where this document and the PDF disagree, the PDF wins and this file is the
bug. Where implementation has deliberately diverged from the PDF, see
`docs/SPEC_DEVIATIONS.md`.

## Quick path

1. Read the phase table for the contract, then the status column for where we
   actually are.
2. Read "The advance rule" before proposing any phase transition — it is the
   rule that makes a transition legal or not.
3. Read the Sprint 0 table for the one gate that is still open.

## Phases (§3, §15.3)

Exit criteria are from §3. Definition of done is from §15.3, which the spec
states separately and which does not always restate the exit criterion.

| Phase | Delivery | Exit criterion (§3) | Definition of done (§15.3) | Priority | Status |
|---|---|---|---|---|---|
| Fase 0 | Transport viability | Minimal test page. Connect, send `ATZ` and `0100`, receive a valid response, record traces and repeat the operation. | Recorded demonstration and `ATZ`/`0100`/`010C` log, **or** a documented decision to change transport. | MUST | **Closed.** Closed through the second branch: the transport decision is documented in `docs/decisions/ADR-002-obd-transport.md`, which took the §3.1 decision gate's native-container path. |
| Fase 1 | Local OBD reader | ELM initialization, protocol detection, supported PIDs, telemetry, DTC, errors and reconnection. | Stable local OBD dashboard, tested parser, read-only DTC. | MUST | **Closed on vehicle evidence with one narrow waiver.** ADR-003 closed it on 2026-08-25 with no vehicle validation at all; ADR-004 superseded that on 2026-08-28 with the real field-test run. See the Sprint 0 table below. |
| Fase 2 | Local diagnostics and warning lights | Severity rules, DTC catalogue, guided warning-light identification, **local TTS** and session logging. | Local evaluation and warning-light catalogue operational without Internet. | MUST | **Coded, not verified.** Local TTS (RF-031) was missing entirely and now ships: a layout-wide toggle, spoken assessments, and a mute. It has **never run on the phone**, so whether the platform engine is reachable from this WebView is still open — [`SPEECH_DEVICE_VALIDATION.md`](SPEECH_DEVICE_VALIDATION.md) check 1 is the gate, and it needs no car. The Rio warning-light catalogue also ships with an unverified-provenance header, see `WARNING_LIGHT_CATALOG_VERIFICATION.md`. |
| Fase 3 | **Voice and AI** | Push-to-talk, transcription, structured responses, swappable AI provider, output validation and temporary local fallback. | Voice/text query with fallback and a structured response. | MUST | **Open since 2026-08-28** — ADR-010. Activation is push-to-talk (RF-030); the "hey kirio" wake word is out of scope and gated separately by ADR-011. |
| Fase 4 | **Convex and maintenance** | Mandatory synchronization, history, maintenance records, reminders, queue recovery and basic export. | Synchronization and maintenance without compromising local operation. | MUST | Not started. |
| Fase 5 | Extensions | Camera, native app, advanced modules, multiple vehicles and historical metrics. | (not listed in §15.3) | **COULD** | Not started. |

Three things this table settles that were being treated as open questions:

- **Voice and AI are one phase, not two.** Fase 3 bundles push-to-talk,
  transcription and the AI provider together. Splitting them is a scope
  decision against the spec, not a reading of it.
- **Convex and maintenance are one phase, not two.** Both live in Fase 4,
  after voice and AI. Convex is also mandatory by the spec's own ADR-006
  (Annex A of the PDF — there is no ADR-006 file in this repository, whose
  `docs/decisions/` numbering is separate) — it is not an
  alternative to Fase 3, it is downstream of it.
- **"Definitive dashboard" is not a phase.** No phase in §3 delivers one.
  Fase 1's definition of done already requires a stable local OBD dashboard;
  anything beyond that is Fase 5 (COULD) or invented scope.

## The advance rule (§3.1)

> No se iniciará una fase mientras la anterior no tenga pruebas reproducibles
> y un criterio de salida verificado. En particular, Nuxt, Convex, voz e IA no
> deben utilizarse para ocultar una conexión OBD inestable.

A phase does not start until the previous one has **reproducible tests** *and*
a **verified exit criterion** — two conditions, not one. The second sentence
names voice, AI and Convex specifically as the things that must not be used to
paper over an unstable OBD connection, which is exactly the transition
currently under consideration.

Fase 1 has reproducible tests. Its exit criterion is **verified except for one
named gap**: A1 met its criterion on vehicle evidence, and A2 closed on a
narrow owner waiver because one of two induced drops did not recover
(ADR-004). The root cause of that failure is understood and fixed in `8c88f1d`
and `7b2792d`, but **those fixes have not been run on the car**.

So the §3.1 question for opening Fase 3 is narrow and specific. It is not
"may we skip validation" — most of it was done. It is: **is ADR-004's A2
waiver accepted as a verified exit criterion, with the post-fix
Bluetooth-toggle recovery still unproven on the vehicle?**

**Answered on 2026-08-28 by [ADR-010](decisions/ADR-010-fase-3-opening.md):
yes.** The gap is one recovery path on hardware that may not be available
soon, and §3.1's stated fear — using voice, AI and Convex to hide an unstable
OBD connection — is not what is happening, since the connection is now the
best-evidenced part of the stack.

Checking §3.1 properly also surfaced a second thing: Fase 3's *actual*
previous phase is Fase 2, and Fase 2's exit criterion includes local TTS
(RF-031, MUST), which had never been built. That one is **not** waived. It was
built as Fase 3's first work item and now ships — but by ADR-012's own
standard, shipped code that has never run on the device proves nothing.
Fase 2 closes when [`SPEECH_DEVICE_VALIDATION.md`](SPEECH_DEVICE_VALIDATION.md)
check 1 passes on the phone, not before.

## Sprint 0 (Anexo B)

Anexo B's immediate milestone: *"No añadir voz, IA, Convex ni dashboard hasta
completar este hito"* — do not add voice, AI, Convex or a dashboard until this
milestone is complete.

| # | Task | Exit criterion | Status |
|---|---|---|---|
| 1 | Create Nuxt 4 repository, enable strict TypeScript | Local build and basic CI | Done |
| 2 | Create `ObdTransport` interface and `MockObdTransport` | Unit test for connection and read | Done |
| 3 | Implement `/lab/obd` page without dashboard | Connect, send, clear and export log buttons | Done |
| 4 | Implement `WebSerialRfcommTransport` | Selects the adapter and receives bytes on Android | **Superseded.** Deleted on 2026-08-25; Web Serial cannot run inside the Capacitor WebView and the owned VEEPEAK adapter is BLE. See `SPEC_DEVIATIONS.md` deviation 1. |
| 5 | Incremental parser up to the `>` prompt | Reconstructs fragmented responses | Done |
| 6 | Run `ATZ`, `ATE0`, `ATL0`, `ATS0`, `ATH0`, `ATSP0` | Repeatable initialization with traces | Done |
| 7 | Run `0100`, `010C`, `0105` | Supported PIDs, valid RPM and temperature | Done |
| 8 | **Ten consecutive connections and one 30-minute session** | **No hangs, no overlapping commands** | **Closed 2026-08-28** (ADR-004). A1 met on evidence: eleven consecutive connections, no errors, 7.7–10.4 s to ready with no drift. A2 closed on an owner waiver — two drops detected, one recovery observed. The 30-minute session was deliberately shortened to ten minutes carrying two drops; the arithmetic and the accepted long-soak gap are in `docs/FIELD_TEST_VEHICLE_VALIDATION.md`. |
| 9 | Save a session capture for `ReplayTransport` | Later development possible without the car | Done |
| 10 | Write the definitive transport ADR | Continue with RFCOMM, change adapter, or evaluate a native container | Done — ADR-002 plus its amendment; the native-container branch was taken |

## Open caveats

None of these block code. All three need a vehicle or an owner decision.

1. **The post-fix Bluetooth-toggle recovery path** has never run on the
   vehicle. `8c88f1d` and `7b2792d` fix the failure A2 observed, and both are
   covered by tests, but neither has been exercised against the car. This is
   the one gap ADR-004 waives. Separately, the long-soak behaviour the
   30-minute session would have probed — slow BLE degradation, memory growth,
   Doze, thermal effects — is knowingly untested.
2. **`docs/DTC_PHYSICAL_VALIDATION.md` check 1** — Mode 03 multi-frame
   framing needs a car with more than three stored DTCs. This project will
   not induce them; the check is opportunistic and may never run.
3. **The temporary Telegram channel** used for physical-test reporting
   (`docs/FIELD_TEST_TELEGRAM.md`) — keep it for future vehicle sessions or
   remove it. Owner decision, not a technical one.

## A warning about ADR numbering

The repository's `docs/decisions/` numbering **collides with the spec's own
ADR numbering** (Annex A of the PDF), and the two mean different things:

| Number | Spec (Annex A) | This repository |
|---|---|---|
| ADR-002 | Web Serial/RFCOMM is the primary transport | Amends it — BLE native, then the Capacitor container |
| ADR-003 | The initial version is read-only | Fase 1 closed without hardware validation |
| ADR-004 | AI does not participate in data acquisition | Part A closed on one observed recovery |
| ADR-005 | Visual recognition is out of scope | *(unused)* |
| ADR-006 | Convex is mandatory for the full product | *(unused)* |

Only ADR-002 is a genuine amendment of its spec counterpart. ADR-003 and
ADR-004 are repo-original decisions that happen to reuse taken numbers. They
are **not** renamed here — they are cross-referenced from several documents,
and renaming would break those links for a cosmetic gain.

New repository ADRs therefore start at **ADR-010**, clear of the spec's
ADR-001..009 range. When a document cites an ADR below 010, it must say
whether it means the spec's or the repository's.

## Next step

Fase 3 is open. Its first work item — local TTS (RF-031), which also closes
Fase 2's outstanding exit criterion — is **coded and awaiting one check on the
phone**.

Speech uses the device's own engines, not a bundled model
([ADR-012](decisions/ADR-012-on-device-speech.md)). The TTS half is written and
shipped; whether those engines are reachable from inside the Capacitor WebView
is **still unverified**. [`SPEECH_DEVICE_VALIDATION.md`](SPEECH_DEVICE_VALIDATION.md)
holds that check. It needs a phone, not a car, and it takes ten seconds — and
until it runs, no further speech work should be built on the assumption that
the API is there.

The wake-word viability gate (ADR-011) is unscheduled and blocks nothing.
