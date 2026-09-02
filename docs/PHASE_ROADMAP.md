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
| Fase 2 | Local diagnostics and warning lights | Severity rules, DTC catalogue, guided warning-light identification, **local TTS** and session logging. | Local evaluation and warning-light catalogue operational without Internet. | MUST | **Closed on device evidence, with check 4 still opportunistic.** Local TTS (RF-031) ships — a layout-wide toggle, spoken assessments and a mute — and on 2026-08-29 the Web Speech path was shown to be inert on the phone because `window.speechSynthesis` does not exist in this Capacitor WebView. ADR-012's option 2 is now implemented through a native Capacitor bridge to Android `TextToSpeech`, and the owner reported the APK working perfectly on the phone. Check 4 in `SPEECH_DEVICE_VALIDATION.md` still needs a stored fault and is not induced by this read-only project. The Rio warning-light catalogue also ships with an unverified-provenance header, see `WARNING_LIGHT_CATALOG_VERIFICATION.md`. |
| Fase 3 | **Voice and AI** | Push-to-talk, transcription, structured responses, swappable AI provider, output validation and temporary local fallback. | Voice/text query with fallback and a structured response. | MUST | **Closed 2026-09-01 as an MVP with no provider deployed** — [ADR-013](decisions/ADR-013-fase-3-closure.md). Push-to-talk, transcription and the local fallback are device-evidenced (`SPEECH_DEVICE_VALIDATION.md` checks 7, 8 and 9). The swappable provider and output validation are evidenced over a real HTTPS connection by `test/integration/remoteAssistantSeam.test.ts`, against a loopback dummy endpoint — no provider, key or backend ships with the static APK. Activation stays push-to-talk (RF-030); the wake word is out of scope and gated by ADR-011. Six items it does not close are named in the ADR and in the caveats below. |
| Fase 4 | **Convex and maintenance** | Mandatory synchronization, history, maintenance records, reminders, queue recovery and basic export. | Synchronization and maintenance without compromising local operation. | MUST | **Opened 2026-09-01 on its local half** — [ADR-014](decisions/ADR-014-fase-4-opening.md). **RF-034 is complete on the local side** as of 2026-09-01: DB v2 added the `diagnosticAssessments` and `maintenanceRecords` stores next to sessions, events, DTC observations and the PID cache, and an install at v1 upgrades without losing rows. Evaluations cascade with their session and roll off with eviction; maintenance records never do. **RF-035's local half landed the same day**: DB v3 stores a durable sync queue keyed by an idempotency key, and `drainSyncQueue` pushes one batch behind the owned `SyncTarget` port (R-09), covering T-011. **RF-036 ships on the local side**: services are recorded in Registro with the interval the owner states, and the panel projects the next one on two axes that are never mixed. **RF-037 ships**: a workshop report, copied to the clipboard from Averías, that separates what the vehicle reported from what this app deduced and from what neither can claim. There is no `convex/` or `server/`: the remote half is gated on the owner deploying an instance. |
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
built as Fase 3's first work item and ships — and by ADR-012's own standard,
shipped code that has never run on the device proved nothing. On 2026-08-29 it
ran, and it failed: `window.speechSynthesis` does not exist in this Capacitor
WebView, so every line of that TTS is inert on the phone.

That native Android bridge has now run on the phone and passed by owner report.
`SpeechAnnouncer` takes an injected `SpeechSynthesisPort`, so the feature selects
a Capacitor `TextToSpeech` adapter on Android and keeps the Web Speech adapter as
the browser fallback. Fase 2's local TTS criterion is closed through that native
path; the assessment-announcement check remains opportunistic until the car has a
stored fault.

**The §3.1 question this section argues is settled.** It was the transition
*into* Fase 3, decided on 2026-08-28. Fase 3 itself closed on 2026-09-01
([ADR-013](decisions/ADR-013-fase-3-closure.md)), so the live §3.1 question is
now the one before **Fase 4**: Fase 3 has reproducible tests, and its exit
criterion is verified with six named gaps that ADR-013 lists rather than
waives. ADR-004's A2 waiver is still carried, not closed.

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

Items 1-5, 7 and 8 block no code: they need a vehicle, a phone session or
an owner action. Item 6 is the only one that is a code change, and it is a
known spec gap rather than a defect.

1. **The post-fix Bluetooth-toggle recovery path** has never run on the
   vehicle. `8c88f1d` and `7b2792d` fix the failure A2 observed, and both are
   covered by tests, but neither has been exercised against the car. This is
   the one gap ADR-004 waives. Separately, the long-soak behaviour the
   30-minute session would have probed — slow BLE degradation, memory growth,
   Doze, thermal effects — is knowingly untested.
2. **`docs/DTC_PHYSICAL_VALIDATION.md` check 1** — Mode 03 multi-frame
   framing needs a car with more than three stored DTCs. This project will
   not induce them; the check is opportunistic and may never run.
3. **Removed field-test uploader.** The temporary Telegram reporting path was
   removed after owner approval. Historical evidence may still note that the
   2026-08-28 field reports lived in Telegram, but future builds must not embed
   Telegram credentials.
4. **No spoken free-form question has reached the assistant panel on the
   phone.** Check 9 drove spoken *quick commands* and a *typed* free-form
   question. Dictating a question and getting the structured local answer is
   wired and unit-tested, and was not rerun on the device after dictation
   changed to tap-to-start/tap-to-stop. Carried by
   [ADR-013](decisions/ADR-013-fase-3-closure.md).
5. **The remote assistant seam has never run inside the Android WebView.**
   `test/integration/remoteAssistantSeam.test.ts` proves it over a real HTTPS
   connection using Node's `fetch`, with certificate validation disabled for
   the loopback dummy. A trusted certificate and CORS from the WebView origin
   are deployment concerns and are unproven. Carried by ADR-013.
6. **§9's "sistema relacionado" is missing from the structured answer.**
   `DiagnosticAssessment` carries §8.2's eight fields and the subsystem lives
   on `DtcCatalogEntry`, which the assessment does not hold. `composeLocalAnswer`
   names the gap instead of inferring a system from a code prefix. Carried by
   ADR-013.
7. **RNF-001 (MUST) has never run, and until 2026-09-01 was never mirrored
   here.** §7 reads *"Una sesión de 60 minutos al ralentí no debe bloquearse
   ni solapar comandos"*, and §15.2 repeats the 60-minute bar as an MVP
   acceptance criterion. This table's Sprint 0 row mirrors Anexo B's
   **30**-minute figure and stopped there. The longest real run against the
   car was **ten** minutes (ADR-004). Nothing in Fase 4 can close this — it is
   a vehicle gate — and **§15.2's MVP acceptance cannot be claimed while it is
   open**. Surfaced by [ADR-014](decisions/ADR-014-fase-4-opening.md).
8. **Neither an AI provider nor a Convex instance is deployed.** §9.5 states
   that the full functional version *"no se considerará terminada sin
   integración operativa de IA y Convex"*, and that degraded mode *"es una
   medida de resiliencia, no una variante del producto sin backend ni IA"*.
   Both deployments are owner actions. Carried by ADR-013 and ADR-014.

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

Fase 3 is closed as of 2026-09-01
([ADR-013](decisions/ADR-013-fase-3-closure.md)). It closed as an **MVP with no
AI provider deployed**: push-to-talk, transcription, structured local answers,
output validation and the local fallback all ship, and the swappable-provider
half is a seam somebody may point at an endpoint later. RNF-006 is why — a
static APK cannot hold a model key, so the provider can only ever live behind
an HTTPS URL the client is told about.

**Fase 4 opened the same day** on its local half
([ADR-014](decisions/ADR-014-fase-4-opening.md)). §3.1 was checked: Fase 3 has
reproducible tests and a verified exit criterion, so the transition is legal,
and the first work items — local persistence and a durable queue — cannot hide
an unstable OBD connection, which is what §3.1's second sentence exists to
prevent.

Work started where no Convex account is needed. **The two missing RF-034
stores landed the same day**: DB v2 adds `diagnosticAssessments` and
`maintenanceRecords`, an install at v1 upgrades without losing rows, and both
persistence adapters implement the new ports. The two record kinds are
deliberately asymmetric — an evaluation cascades with its session and rolls
off with eviction, while a maintenance record, being what the owner typed,
survives every session lifecycle.

**RF-035's local half landed the same day.** DB v3 adds a queue keyed by an
idempotency key rather than an insertion counter, which is what makes
§15.2's *"reintenta sin duplicar datos"* structural instead of hopeful.
`drainSyncQueue` pushes exactly one batch and reports what happened; it is
deliberately not a loop, because retrying until empty would spin against a
down backend and would decide on its own how long to keep the radio busy in a
car. T-011 is covered: with the remote unavailable nothing leaves the queue
and every operation carries one more attempt. The `SyncTarget` port is the
seam a Convex client will implement, and per §6 and R-09 the OBD core never
learns it exists.

**RF-036 ships with owner-entered intervals**, decided on 2026-09-02. Its due
dates need service intervals, and the manual the spec names as their source
(`YB_2019_es_ES.pdf`, chapter 8) carries **618 font dictionaries and zero
`/ToUnicode` maps**. No extractor can read it correctly — every one produces
the same shifted bytes — so obtaining those intervals means inferring a font
encoding, and a wrong digit in a service-interval table is a claim about a
real car. Asking the person who owns the manual is the honest way to get the
number, and it keeps the app saying *"this is what you told me"* rather than
*"this is what Kia recommends"*. If §10 is ever undeferred, extracted
intervals become defaults that pre-fill that field; nothing built here is
thrown away.

Two consequences are visible on screen. Every kilometre figure names the
odometer reading it was measured from and when that reading was entered,
because the odometer is not among the PIDs this project reads. And the two
axes are never mixed into one number: ranking "500 km left" against "200 days
left" needs to know how much this car is driven, so overdue sorts first, then
dated services, then mileage-only ones.

**RF-037 ships too.** The report states four limits on every session,
including a clean one — read-only with nothing cleared, a generic SAE
catalogue rather than Kia's, no freeze frame read, and no vehicle-sourced
odometer — and it keeps the distinction `readDiagnosticCodes` was written
for: a padded frame with no codes is the vehicle reporting zero, while
`NO DATA` is the vehicle saying nothing, and only the first is a zero. A
workshop told otherwise would rule out a fault nobody ruled out. The control
sits outside the connection gate, because the report is read after the
session with the adapter unplugged.

Maintenance lives inside **Registro** rather than behind a sixth destination.
`BottomTabBar` hardcodes five columns with a comment saying a sixth must break
the layout visibly rather than silently reintroduce scrolling, and that
tripwire did its job. The grouping holds on its own: the other destinations
are about this session with the car, these two are about what is known over
time.

A second RF-036 question is open and cheaper to settle: whether the car
reports its own odometer, which decides where the mileage axis of a due date
comes from. `01A0` is already an allowed read and already a button, so the
check needs no code —
[`ODOMETER_PID_VALIDATION.md`](ODOMETER_PID_VALIDATION.md) carries the
procedure and an empty results row.

**RF-035's remote half now exists.** A Convex deployment was created by the
owner on 2026-09-02, `@lupinum/better-convex-nuxt` is registered as a
Convex-only build with no auth proxy, and `convex/schema.ts` carries only what
§5 names — sessions and maintenance, indexed by the device's own id, with
every write upserting on it. `createConvexSyncTarget` reads each row at push
time, because the queue holds references rather than snapshots.

Verified against the live deployment, not just in tests: pushing a maintenance
record and a session each returned their `localId`, pushing the same id again
replaced rather than duplicated, and the delete mutation — whose lookup uses
`.unique()` and would throw on a duplicate — succeeded. Both smoke rows were
removed afterwards.

**The deployment runs without authentication, deliberately** —
[ADR-015](decisions/ADR-015-no-backend-auth.md). The owner is the only user,
the APK is side-loaded rather than distributed, the tables hold session
summaries and one car's service history, and IndexedDB keeps the
authoritative copy locally. The ADR names the four things that would reopen
the decision, the first being the APK reaching anyone else.

Reading §7 for that ADR surfaced **RNF-001**, a MUST this repository had never
written down: a 60-minute session at idle must not hang or overlap commands.
The longest real run was ten minutes. It is caveat 7 below, it is a vehicle
gate, and **§15.2's MVP acceptance cannot be claimed while it is open**.

### What the device actually proved

Speech uses the device's own engines, not a bundled model
([ADR-012](decisions/ADR-012-on-device-speech.md)), and the two halves of the
Web Speech API disagree on this phone. Synthesis is absent — check 1 failed on
2026-08-29 with `window.speechSynthesis` undefined, which ADR-012 anticipated
as its option 2 — and it now ships through a native Capacitor bridge to
Android `TextToSpeech`, which closes Fase 2's `TTS local` criterion.
Recognition needed no bridge: its constructor is present and unprefixed, a
real `start()` returned a transcript, and it works with no Internet (checks 6,
7 and 8).

On the installed APK, dictated quick commands drove the same
`parseQuickCommand` path as typed ones — *"temperatura"*, *"estado"*,
*"testigo"*, *"códigos"* — and a **typed** *"que significa esto"* opened the
structured local answer panel showing `Fallback local` and *"sin proveedor de
IA configurado"* (check 9). The **spoken** free-form question was not rerun
after dictation changed to tap-to-start/tap-to-stop; that is caveat 4.

The offline recognition pack belongs to this phone, not to Android, so the
voice path must keep degrading to the text command bar on a device without
one.

### The provider seam

The assistant optionally calls a public endpoint configured with
`NUXT_PUBLIC_ASSISTANT_ENDPOINT_URL`. The static Android build still has no
Nitro `/api` route, no bundled AI dependency and no client-side model key.
The endpoint contract, and the evidence behind it, live in
[`ASSISTANT_REMOTE_PROVIDER.md`](ASSISTANT_REMOTE_PROVIDER.md):
`test/integration/remoteAssistantSeam.test.ts` exercises it over a real HTTPS
connection in eight cases, six of which end in the local fallback, because
the fallback is the part that has to hold. When the URL is absent the resolver keeps the
no-provider local fallback, and remote text stays untrusted until
`validateAssistantResponse` accepts or rejects it.

Deploying a real provider is future work governed by that contract. It does
not reopen Fase 3.

The wake-word viability gate (ADR-011) is unscheduled and blocks nothing.
