# Vehicle field test — everything still unvalidated

**Status: OPEN — NOT RUN.** Nothing in this document has been executed
against the Kia Rio. Change a section's status only by attaching the raw
evidence it asks for, never by deciding it probably works.

This is one trip to the car. It closes, in order:

| Part | Closes | Blocking? |
|---|---|---|
| A | Sprint 0 task 8 — the Fase 1 exit criterion, waived by ADR-003 rather than met | **Yes** |
| B | `DTC_PHYSICAL_VALIDATION.md` check 2 — Mode 07/0A empty-result behaviour | No |
| C | The Rio warning-light catalogue, never compared to the real cluster | No |
| D | `DTC_PHYSICAL_VALIDATION.md` check 1 — Mode 03 multi-frame | Opportunistic only |

Part A is the one that matters. B, C and D improve things that already
work; A is the only place where a failure would mean the app breaks in a
driver's hands.

## Before you leave the house

1. Build and install the current `master` on the phone:
   `pnpm android:build:debug`, then install the APK.
2. Charge the phone. Part A runs 30+ minutes with the screen on.
3. Have a notebook or a second device. **Do not rely on memory for
   observations** — you will be reading a small screen next to a running
   engine.
4. Create a folder to drop exported JSON into, one file per step.

## Safety

Unchanged from every physical procedure in this project.

- The lab is **read-only**. Mode 04, DTC clearing, ECU writes, coding and
  adaptation are forbidden. `PhysicalObdCommandPolicy` enforces this
  below the UI, and no step below asks you to bypass it.
- Vehicle **stationary**, parking brake on, gearbox in neutral or park.
- Part A runs the engine for 30 minutes. **Outdoors or in a ventilated
  space.** Carbon monoxide is the real hazard here, not the software.
- Never operate the phone while driving. No step in this document
  requires the car to move.
- If anything smells, smokes, overheats or sounds wrong, stop the engine
  and abandon the test. A missing datapoint costs nothing.

---

> **UI note.** Android BLE is now the only transport the app ships and the
> only option in the selector, so nothing has to be set before connecting.
> The technical panel that holds it is **Controles técnicos** — it was
> called "Herramientas OBD avanzadas" when this document was first written.

## Part A — Sprint 0 task 8 (blocking)

**What is unknown.** Reconnection has never run against this car. No drop,
so no recovery, has ever been observed on the vehicle: it is proven only
against `ReplayObdTransport` and fake timers. Persistence has never run in
the Android WebView, only against `fake-indexeddb` in Node. The sole
vehicle evidence to date is one 91-event session on 2026-08-24, during
which nothing disconnected.

**What closes it.** Ten consecutive connections, plus one 30-minute
session containing at least one drop and its recovery.

### A1 — Ten consecutive connections

With the ignition on and the engine off:

1. Open the app, go to **Conexión**.
2. **Buscar adaptador** → pick the VEEPEAK.
3. **Conectar**. Wait for the badge to read ready.
4. **Desconectar**.
5. Repeat 2–4 **ten times without closing the app**.

Record for each of the ten: did it reach ready, how long it took roughly,
and anything that needed a retry. **A retry is a result, not a mistake to
hide** — write it down.

Then go to **Registro** → **Exportar** and save the JSON as `A1.json`.

> Ten in a row matters more than ten total. A stack that leaks a
> subscription or a stale executor usually survives the first two
> connections and fails around the fifth.

### A2 — Thirty-minute session with a real drop

Start the engine. Ventilated space.

1. Connect as in A1 and reach ready.
2. Go to **Datos** and press **Ver lecturas**. Leave it running.
3. Let it run undisturbed for about ten minutes. Note whether values keep
   updating or quietly freeze.
4. **Induce a drop.** Use one of these, in order of preference:
   - **Unplug the adapter from the OBD port for ~5 seconds, then plug it
     back in.** Cleanest and most controlled. Safe: the port is powered,
     unplugging a reader writes nothing.
   - Walk ~20 m away from the car with the phone until the link drops,
     then walk back.
   - Turn the phone screen off, wait two minutes, turn it back on.
5. **Watch what the app does.** This is the actual test. Record:
   - Did the badge change away from ready, or did it lie and stay ready?
   - Did it attempt to reconnect on its own?
   - Did it recover, and roughly how long did that take?
   - After recovery, did telemetry resume, or did it stay dead while the
     badge claimed ready?
6. Continue the session to **30 minutes total**.
7. Press **Pausar lecturas**, disconnect, and export the log as `A2.json`.

**A2 passes only if the drop was detected and the recovery observed.** A
30-minute session where nothing dropped is not a pass — it is an
unfinished test, and you should induce a drop before stopping.

---

## Part B — Mode 07 and 0A empty-result behaviour

**What is unknown.** Whether this ECU answers `07` and `0A` with a padded
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

**What is unknown.** `catalog/kia-rio/warning-lights/` holds the 13
standardised ISO 2575 / ECE R121 tell-tales. They have never been compared
against this car's instrument cluster or its owner's manual, and the
`shape` values are descriptive identifiers chosen for the catalogue, not
names from any Kia document.

With the ignition on and the engine off, the cluster performs its lamp
test — most tell-tales illuminate for a few seconds. That is the moment to
photograph.

1. Turn the ignition on **without starting the engine** and photograph the
   full cluster during the lamp test. Take several; they go out fast.
2. Compare against the 16 entries in the catalogue and list:
   - Tell-tales on the cluster that are **not** in the catalogue.
   - Catalogue entries this car does **not** have.
   - Any whose colour differs from what the catalogue claims.
3. Then open **Datos** → the warning-light section, answer the guided
   questions for two or three real lights, and check whether it reaches
   the right one.

Missing entries are the expected finding, not a bug: an unknown light
correctly surfaces as "sin identificar" with the safe alternative.

Step 2 of this part used to say "photograph the manual's warning-light
pages". That comparison is done — see
`docs/WARNING_LIGHT_CATALOG_VERIFICATION.md`, which confirmed eleven
entries against the manual, found two the manual does not support, and
added the three it named that the catalogue lacked. What is left here is
the part no document can answer: which lamps **this** car physically has.
The manual covers the YB generation across trims and markets, and "si está
equipado" runs through it — including all three of the new entries.

---

## Part D — Mode 03 multi-frame (opportunistic only)

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

- `A1.json`, `A2.json`, `B.json`, and `D.json` if Part D ran.
- Your written observations for A1 and A2, including retries and timings.
- The cluster and manual photographs for Part C.

Then, and only then:

- Record each part as an ADR — **pass or fail** — and change its status
  here and in `DTC_PHYSICAL_VALIDATION.md` from OPEN to the ADR reference.
- A check is closed by evidence, never by a decision to stop worrying
  about it. That distinction is what ADR-003 got wrong for Fase 1, and why
  Part A is still open with two phases built on top of it.

## Stop conditions

Abandon the session and report what you have if any of these happen:

- The adapter gets hot, or the car behaves oddly after connecting.
- A warning light appears that was not on before you started.
- The app sends a command you did not ask for. Export the log
  immediately; that is a defect worth more than the rest of the session.
- You feel unwell. Carbon monoxide is odourless.
