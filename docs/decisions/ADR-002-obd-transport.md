# ADR-002: Android BLE is the primary OBD transport

**Status**: Accepted
**Date**: 2026-08-25
**Supersedes**: ADR-002 in the v2.0 spec (`docs/Especificacion_Final_Asistente_Kia_Rio_v2.0.pdf`, Annex A), which named Web Serial/RFCOMM as the primary Android transport
**Related**: `docs/ANDROID_BLE_CONTRACT.md`, `docs/SPEC_DEVIATIONS.md`, Sprint 0 task 10 (spec Annex B.1)

> **Current-status note (2026-08-28):** the original ADR body below is preserved
> as the 2026-08-25 transport decision and evidence history. Its statements that
> `WebSerialRfcommTransport` existed, stayed dormant, Sprint 0 task 8 remained
> open, and reconnection had no vehicle evidence are historical where they
> conflict with the amendment below and ADR-004. Current state: the Web
> Serial/RFCOMM transport has been deleted; `AndroidBleObdTransport` is the only
> physical transport; Sprint 0 task 8 is closed with A1 met and A2 owner-waived;
> reconnection has limited vehicle evidence with one post-fix Bluetooth-toggle
> recovery gap still not rerun on the car.

## Decision

`AndroidBleObdTransport` (the Capacitor Android BLE bridge, configured with
`VEEPEAK_BLE_PROFILE`) is the only transport implementation validated against
the real vehicle, and is the transport this project builds on going forward.

`WebSerialRfcommTransport` exists in the repository
(`core/obd/transport/WebSerialRfcommTransport.ts`) and has unit test coverage
against a fake serial port, but **it has never been run against the
vehicle**. Its validation status is unknown, not failing — it was simply
never exercised on hardware.

## Context

The v2.0 spec bet on Web Serial over Bluetooth RFCOMM as the primary Android
transport (spec sections 5.2, 13.1, 17, and Annex A ADR-002), with BLE/GATT
kept as an "optional, experimental" fallback. That bet predates any hardware
test. Sprint 0 task 10 (Annex B.1) explicitly asks for this ADR to be
rewritten once a transport is proven: "Redactar ADR de transporte
definitivo. Continuar con RFCOMM, cambiar adaptador o evaluar contenedor
nativo."

Vehicle testing went the other way. The BLE path was implemented, wired into
the native Capacitor bridge (`BleObdBridgePlugin`), and run against a real
Kia Rio. The RFCOMM path was never attempted on the vehicle at all.

## Evidence

- `docs/ANDROID_BLE_CONTRACT.md` records real native UUID wiring,
  characteristic writes, and notifications as "confirmed on hardware
  (2026-08-24)", with an `ATZ` round trip answering `ELM327 v2.2`.
- Commit `87f11f7` (`feat(policy): approve the whole Mode 01 capability probe
  range`) widened the read-only command policy specifically because the BLE
  path proved it could walk the full Mode 01 PID range on the real ECU.
- A complete, confirmed session exists as a replay fixture
  (`test/fixtures/kiaRio2026-08-24Session.json`, added in commit `b1a9754`):
  - Vehicle: Kia Rio YB 2019 1.2 MPI, parked, engine idling
  - Session ID: `1f817ef7-0ece-4747-af3c-c3de2f3faaa6`
  - Transport: `{ kind: "android-ble", name: "VEEPEAK" }`
  - 91 events captured, `droppedEvents: 0`, marked `complete: true`
  - Live telemetry decoded correctly (`410C0C4C` → 787 rpm, `410571` → 73°C),
    both checked by hand against the OBD formulas
- `WebSerialRfcommTransport.ts` has no equivalent evidence: no replay
  fixture, no session log, no commit recording a vehicle run. Its test
  suite (`test/unit/webSerialRfcommTransport.test.ts`) exercises a fake
  serial port only.

### What this evidence did NOT cover on 2026-08-25

One confirmed session was enough to decide transport primacy; it was not enough
to declare Fase 1 validated. At the time this ADR was accepted, Sprint 0 task 8
(spec Annex B.1) asked for **ten consecutive connections and one 30-minute
session** and remained **open** — only the single 91-event session above
existed. Reconnection behaviour in particular had no vehicle evidence at all
and was proven only against replay and mock transports.

Later field evidence and the owner waiver are recorded in ADR-004; the summary
above is intentionally historical.

## Historical consequences on 2026-08-25

- New transport-facing work (lab UI, reconnection, persistence) targeted
  `AndroidBleObdTransport` as the vehicle-proven path.
- `WebSerialRfcommTransport` stayed in the codebase as a dormant, unproven
  alternative. It was not deleted by this original decision — a future adapter
  change or a different Android BLE limitation could have revived the RFCOMM
  path — but no feature work could assume it was vehicle-ready without first
  running the same hardware validation the BLE path went through.
- `docs/SPEC_DEVIATIONS.md` records the specific spec sections this decision
  supersedes so a future reader does not have to reconcile the two documents
  by hand.
- This ADR does not claim RFCOMM does not work — only that it was never
  tested. Do not restate the untested status as a proven failure in later
  documents.

## Amendment (2026-08-25): `WebSerialRfcommTransport` deleted

**What changed**: `core/obd/transport/WebSerialRfcommTransport.ts` and its
test suite were removed from the repository. The "stays in the codebase as a
dormant, unproven alternative" consequence above is superseded — the
transport no longer exists. `PHYSICAL_TRANSPORT_KINDS`
(`core/obd/transport/ObdTransport.ts`) now holds exactly one entry,
`'android-ble'`.

**Why this is not "BLE won"**: primacy was already decided above on vehicle
evidence. The reason for outright deletion is different and stronger — the
transport cannot run at all on the app's actual target platform:

- The app ships as a Capacitor Android app, not a desktop browser.
- Official Chrome documentation limits native Web Serial to desktop
  platforms. On Android, Chrome offers only USB serial through WebUSB plus a
  polyfill; Chrome's RFCOMM support announcement is explicitly
  desktop-only. `WebSerialRfcommTransport`'s own error string already said
  this (`"current Chrome documentation limits native Web Serial to desktop
  platforms"`) — the code recognized the gap it could not close.
- Independently, the VEEPEAK OBDCheck BLE+ adapter this project owns is a
  BLE device. RFCOMM is classic Bluetooth, a different protocol from BLE
  GATT. Even on a platform where Web Serial worked, this transport could
  not talk to the owned adapter.

Given both, keeping the code "dormant" was not preserving a real future
option — it was bundling unreachable code that could only ever surface a
platform error to a user picking it from the lab transport selector.

**What this amendment does NOT claim**: this is still not a claim that
RFCOMM does not work as a protocol, or that a future non-Capacitor,
desktop-targeted build could not use it. It is a claim that this transport
could never execute inside this app on this platform, with this adapter —
and was never tested on the vehicle before removal.

**Read-only safety net preserved**: the transport-boundary integration test
that proves the physical read-only policy is enforced at the transport
(`test/unit/physicalReadOnlyPolicyIntegration.test.ts`) was rehomed onto
`AndroidBleObdTransport` rather than deleted, so this removal does not
reduce that coverage.
