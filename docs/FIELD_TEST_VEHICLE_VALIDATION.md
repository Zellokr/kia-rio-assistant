# Vehicle field test

**Status: RUN on 2026-08-28.** Two runs against the Kia Rio, twenty-one
sessions in total. Change a section's status only by attaching the raw
evidence it asks for, never by deciding it probably works.

| Part | Status | On what |
|---|---|---|
| A1 | **Closed** | Criteria met — eleven consecutive connections |
| A2 | **Closed** | Owner waiver, `ADR-004`: one of two recoveries observed |
| B | **Closed** | Criteria met — all three modes answered |
| C | **Closed** | Cluster photographed and compared; guided identifier owner-reported correct for ABS, seatbelt and immobilizer |
| D | **Not executable** | The car has no stored codes to multi-frame |

Historical evidence from the 2026-08-28 run lived in the temporary Telegram field-test channel: two reports and twenty-one session JSON files, sent by the app itself. That uploader has since been removed; future field runs must use local log copy/export or a new reviewed evidence path that does not embed client-side credentials.

This is one trip to the car. It closes, in order:

| Part | Closes | Blocking? |
|---|---|---|
| A | Sprint 0 task 8 — the Fase 1 exit criterion. **Closed 2026-08-28; A1 met, A2 owner-waived in `ADR-004`** | **Yes** |
| B | `DTC_PHYSICAL_VALIDATION.md` check 2 — Mode 07/0A empty-result behaviour | No |
| C | The Rio warning-light catalogue and guided identifier, now checked against real cluster evidence | No |
| D | `DTC_PHYSICAL_VALIDATION.md` check 1 — Mode 03 multi-frame | Opportunistic only |

Part A is the one that matters. B, C and D improve things that already
work; A is the only place where a failure would mean the app breaks in a
driver's hands.

## Before you leave the house

1. Build and install an ordinary APK. The temporary field-test report sender was removed; do not create APKs with embedded Telegram credentials. Use the local session log copy/export path for any future evidence.
2. Charge the phone. The original Part A plan ran 20–25 minutes with the
   screen on; the executed A2 was deliberately shortened to about ten minutes.
3. **No notebook.** The app records every observation the procedure used to
   ask for, and sends them as a report. Transcribing timings off a small
   screen next to a running engine was the least reliable instrument in
   this test and the one nobody could check afterwards.

## Safety

Unchanged from every physical procedure in this project.

- The lab is **read-only**. Mode 04, DTC clearing, ECU writes, coding and
  adaptation are forbidden. `PhysicalObdCommandPolicy` enforces this
  below the UI, and no step below asks you to bypass it.
- Vehicle **stationary**, parking brake on, gearbox in neutral or park.
- Part A runs the engine for about ten minutes. **Outdoors or in a
  ventilated space.** Carbon monoxide is the real hazard here, not the
  software.
- Never operate the phone while driving. No step in this document
  requires the car to move.
- If anything smells, smokes, overheats or sounds wrong, stop the engine
  and abandon the test. A missing datapoint costs nothing.

---

> **UI note.** Android BLE is now the only transport the app ships, and the
> selector that used to offer alternatives is gone, so nothing has to be set
> before connecting.
> The technical panel that holds it is **Controles técnicos** — it was
> called "Herramientas OBD avanzadas" when this document was first written.

## Part A — Sprint 0 task 8 (blocking)

> **CLOSED 2026-08-28.** A1 met criteria: eleven consecutive connections,
> no errors, 7.7–10.4 s to ready with no drift across the run. A2 closed by an
> owner waiver recorded in `ADR-004`: two drops were detected and one
> recovery observed — 4.4 s from detection to `ready`, with telemetry
> resuming 2.5 s later, the first time reconnection has ever run against
> this car.
>
> The second drop was a Bluetooth toggle and did not recover. Root cause is
> understood and fixed in `8c88f1d` and `7b2792d`; **those fixes have not
> been run on the vehicle**. The procedure below is kept as written so the
> gap stays legible.

**What had been unknown before this run.** Reconnection had never run against
this car. No drop, and therefore no recovery, had ever been observed on the
vehicle: it was proven only against `ReplayObdTransport` and fake timers.
Persistence had never run in the Android WebView, only against
`fake-indexeddb` in Node. The sole vehicle evidence before 2026-08-28 was one
91-event session on 2026-08-24, during which nothing disconnected.

**Original closure criterion.** Ten consecutive connections, plus one session
containing at least one drop and its recovery. That session was specified
as thirty minutes and was shortened to ten with two drops on 2026-08-28;
the reasoning, and what the shortening gives up, are in A2 below. The current
closure is the explicit A2 waiver in `ADR-004`, not hidden direct evidence for
both recoveries.

### A1 — Ten consecutive connections

With the ignition on and the engine off:

1. Open the app, go to **Conexión**.
2. **Buscar mi adaptador**. There is nothing to pick: the bridge scans for
   five seconds and takes the first VEEPEAK it sees.
3. **Conectar**. Wait for the badge to read ready.
4. **Desconectar**.
5. Repeat 2–4 **ten times without closing the app**.

Nothing to record by hand. Each attempt opens a session that is written to
IndexedDB as it happens, and the report reads all ten back — whether each
reached ready, how long it took, and what errored on the way. **A retry is
a result, not a mistake to hide**, and it lands in the report either way.

Send nothing yet: the report goes once, at the end of A2, and covers every
session recorded since.

> Ten in a row matters more than ten total. A stack that leaks a
> subscription or a stale executor usually survives the first two
> connections and fails around the fifth.

### A2 — Ten-minute session with two real drops

Start the engine. Ventilated space.

> **Shortened from thirty minutes on 2026-08-28, deliberately.** The
> arithmetic said the length was buying almost nothing. Five PIDs at
> 1000/1000/1500/2000/3000 ms is about 3.5 polls per second and roughly 19
> events per second, so thirty minutes reaches around 34,500 events against
> a 50,000 ring buffer — neither length exercises truncation. Reconnection
> backs off over 21s under a 30s deadline, so a drop and its recovery fit
> inside a minute.
>
> The time is spent on a second drop instead. **Two recoveries from two
> different causes prove more about reconnection than thirty quiet minutes
> and one.**
>
> What this no longer tests is the long soak: slow BLE-stack degradation,
> memory growth, Doze, thermal effects. That is a real gap, and it is
> accepted knowingly rather than overlooked. If a session ever fails in a
> way that smells like duration, the thirty-minute run is the next thing to
> try.

1. Connect as in A1 and reach ready.
2. Go to **Datos** and press **Ver lecturas**. Leave it running.

   **Do not leave the app during this part.** The poll loop runs on WebView
   timers, so backgrounding it stops the readings without the link dropping
   — which looks exactly like the failure being tested. Between A1's
   connection cycles, and during B and C, leaving the app is fine.
3. About three minutes in, **induce the first drop**: unplug the adapter
   from the OBD port for ~5 seconds, then plug it back in. Cleanest and
   most controlled, and safe — the port is powered, and unplugging a reader
   writes nothing.
4. Watch it recover, and confirm the readings come back and stay live for a
   couple of minutes.
5. Around minute eight, **induce a second drop by a different cause**. The
   original procedure was to walk ~20 m away from the car with the phone until
   the link dropped, then come back, because using the same cause twice tests
   one path twice.

   The executed 2026-08-28 run used a Bluetooth toggle for this second drop
   instead. That path did not recover on the vehicle; the later fixes are the
   specific post-fix gap that has not been rerun.

   > **Not by turning the screen off**, which this document used to offer.
   > The BLE link is held natively in `BleObdBridgePlugin` and survives
   > backgrounding, but the poll loop is a `setTimeout` chain inside the
   > Android WebView, which Android throttles or suspends. Polling would
   > stop while the link stayed up — indistinguishable on screen from a real
   > drop, and A2 would record a recovery that never tested reconnection at
   > all. That is fabricated evidence for the one thing Part A blocks on.
6. Press **Pausar lecturas**, disconnect, and use **Registro → Copiar registro** to export the local session log.

**Original A2 evidence criterion:** both drops detected and both recoveries
observed. The current 2026-08-28 status is different and explicit: A2 is closed
by owner waiver in `ADR-004`, with one observed recovery and one unrepeated
post-fix Bluetooth-toggle recovery gap. A future rerun can use the original
criterion to replace the waiver with direct evidence.

**Nothing here needs writing down by hand if the local log is exported.** The session events contain what the old version asked a human to observe — whether the state stopped claiming ready, whether it retried on its own, how long recovery took, and whether telemetry resumed afterwards or stayed dead behind a ready badge.

---

## Part B — Mode 07 and 0A empty-result behaviour

> **CLOSED 2026-08-28.** This ECU answers `03`, `07` and `0A` with a padded
> frame: a decodable response carrying zero codes. Not `NO DATA`, and not
> `?` for an unsupported mode.
>
> The evidence is that the reads were logged at all.
> `readDiagnosticTroubleCodes` records a `decoded-value` event only when the
> outcome is `codes`; a `NO DATA` or a `?` returns before reaching it. Eight
> such events are in the session of 16:48 — two for `03`, three for `07`,
> three for `0A`.
>
> The copy can stop hedging for this vehicle. It must keep hedging in
> general: one ECU is not the standard.

**What was unknown.** Whether this ECU answers `07` and `0A` with a padded
frame, with `NO DATA`, or with `?` because it does not implement the mode.

**Why it cannot go wrong.** All three branches ship implemented. A padded
frame reports "sin códigos", a `NO DATA` reports "sin confirmar", and a
`?` reports "sin confirmar" for an unsupported mode. You are recording
which branch this car takes so the copy can stop hedging — not finding out
whether the app is correct.

Ignition on, engine may be off:

1. Connect and reach ready.
2. Go to **Datos**, scroll to **Leer códigos de avería**.
3. Press **Códigos almacenados**. Record the card's exact wording.
4. Press **Códigos pendientes**. Record the exact wording.
5. Press **Códigos permanentes**. Record the exact wording.
6. Export the log as `B.json`.

For each of the three, note which of these you saw, verbatim:

- `El vehículo respondió sin códigos …` → padded frame.
- `Sin confirmar: el vehículo no respondió …` → `NO DATA`.
- `Sin confirmar: este vehículo no admite …` → `?`, unsupported mode.
- `La lectura falló …` → something else went wrong; the raw log matters.

The raw frames in `B.json` are the evidence. The card wording is only a
convenient summary of it.

---

## Part C — Warning-light catalogue

> **CLOSED 2026-08-28; updated from the clearer photograph supplied later
> and from the owner's report of the guided-identifier run.** A high-resolution
> cluster photograph was captured with the ignition on, engine off, at
> 76066 km. Ten existing entries are confirmed present: `abs`, `tpms`,
> `esc-traction`, `power-steering`, `charging-system`, `oil-pressure`,
> `brake-system`, `airbag-srs`, `check-engine`, and `immobilizer`.
>
> Two physical findings are now catalogue entries: amber `esc-off`
> (`car-with-skid-marks-off`) and red `seatbelt`
> (`seated-person-with-belt`). The shape values are descriptive catalogue
> identifiers, not Kia document names.
>
> The amber lamp below ABS is the already-catalogued TPMS lamp, not a second
> amber `(!)`, and there is no door-ajar lamp. The amber key-shaped lamp at
> the lower right confirms the already-catalogued `immobilizer` entry rather
> than a GPF or other emissions warning. `(A)` Auto Stop/Start is a status
> indicator, not a warning. No other lamps are marked absent because a lamp
> test does not illuminate every fault-dependent tell-tale.
>
> The guided identifier was run during the last vehicle trip, according to the
> owner. The owner tested `abs`, `seatbelt`, and `immobilizer`; all three
> reached the correct result. No screenshots or exported identifier evidence
> were captured, so the identifier evidence is recorded as owner-reported.

**What is unknown.** The manual covers the YB generation across trims and
markets, and "si está equipado" runs through it, so this lamp test cannot
establish which unlit tell-tales are fitted. The `shape` values are
descriptive identifiers chosen for the catalogue, not names from any Kia
document.

The photograph completed the physical catalogue comparison. The later
owner-reported guided-identifier run completed the UI-flow check for three
real lights: `abs`, `seatbelt`, and `immobilizer`. An unknown light must still
remain "sin identificar" with the safe alternative, not be matched to a
plausible-looking catalogue entry.

The owner's-manual comparison remains recorded in
`docs/WARNING_LIGHT_CATALOG_VERIFICATION.md`; this physical result adds only
the observations the photograph supports and makes no absence claim.

---

## Part D — Mode 03 multi-frame

> **NOT EXECUTABLE on this vehicle, 2026-08-28.** Mode 03 answered with zero
> stored codes, so there is no multi-frame response to validate. This is not
> a failure and does not block: it waits for a car with a real fault, or for
> a different vehicle.
 (opportunistic only)

**Run this only if Part B reported more than three stored codes.** This
project never induces faults, and a healthy car will not produce them on
demand. If the opportunity never arises, check 1 stays open indefinitely —
that is an acceptable outcome.

If you do have more than three stored codes:

1. Read stored codes and export the log as `D.json`.
2. From the raw response, record **whether a DTC-count byte appears after
   `0x43`**, and the exact byte layout.
3. Compare the decoded codes against a reference tool read from the same
   vehicle in the same state.
4. Attach the raw capture. A conclusion without the raw bytes is not
   evidence.

The decoder deliberately never strips a count byte, so a positive result
here is a small, deliberate change — not a rewrite.

---

## Returning the evidence

Bring back:

- The local session JSON copied/exported from the app. For the historical
  2026-08-28 run, the removed temporary uploader had already sent the report
  and session JSON files to Telegram; future runs must not rely on embedded
  Telegram credentials.
- `B.json` if Part B ran, and `D.json` if Part D ran.
- The cluster photographs for Part C, plus screenshots if a future run repeats
  the guided identifier. The 2026-08-28 identifier closure is owner-reported
  and has no screenshots.

Then, and only then:

- Record any future rerun as an ADR — **pass or fail** — and change the
  relevant status here and in `DTC_PHYSICAL_VALIDATION.md` only when new raw
  evidence supports it.
- A check is closed by evidence, never by a decision to stop worrying about it.
  ADR-004 records the current Part A state: A1 met its criterion, and A2 closed
  by owner waiver with one specific post-fix Bluetooth-toggle gap still visible.

## Stop conditions

Abandon the session and report what you have if any of these happen:

- The adapter gets hot, or the car behaves oddly after connecting.
- A warning light appears that was not on before you started.
- The app sends a command you did not ask for. Export the log
  immediately; that is a defect worth more than the rest of the session.
- You feel unwell. Carbon monoxide is odourless.
