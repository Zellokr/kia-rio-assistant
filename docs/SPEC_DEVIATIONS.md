# Spec deviations from the v2.0 document

The implementation has diverged from
`docs/Especificacion_Final_Asistente_Kia_Rio_v2.0.pdf` (v2.0) in three ways
that vehicle evidence and an implementation decision have overtaken, plus one
structural difference in how session states are modeled. This document is
the map between what the spec says and what the repository actually does, so
a future reader does not have to reconcile the two by hand.

None of these deviations change the read-only, local-first scope of the
project. They record where reality diverged from the plan, not a change in
intent.

## Quick path

1. Read the table below for the three stale spec claims and their evidence.
2. Read the state mapping table if you are comparing `SessionController`
   (spec) against `ObdSessionStateMachine` (repo).
3. Treat this document, `docs/ANDROID_BLE_CONTRACT.md`, and
   `docs/decisions/ADR-002-obd-transport.md` as the current source of truth
   over the PDF for the topics listed here.

## Stale spec claims

| # | Spec location | Stale claim | Current reality |
|---|---|---|---|
| 1 | Annex A (ADR-002), section 5.2, section 17 | Web Serial/RFCOMM is the primary Android transport; BLE/GATT is an optional, experimental fallback | Inverted by vehicle evidence, then removed outright on 2026-08-25. `AndroidBleObdTransport` is the only transport implementation in the repository, and the only one validated against the real car (2026-08-24, Kia Rio YB 2019 1.2 MPI). `WebSerialRfcommTransport` had unit tests against a fake port but was never run against the vehicle, and was deleted because official Chrome documentation limits native Web Serial to desktop platforms — it could never execute inside the Capacitor Android app — and because the owned VEEPEAK adapter is BLE, a different protocol from RFCOMM. See the amendment in `docs/decisions/ADR-002-obd-transport.md` for the full evidence trail. |
| 2 | Sections 5.2, 13.1, 16, RNF-005 | The app is a Chrome-Android PWA (RNF-005: "Chrome Android actualizado"; section 16: "Chrome 138 o posterior" for RFCOMM) | The app ships as a Capacitor Android app (`@capacitor/android` 8.5.0), not a browser PWA. This shift was authorized by the spec's own section 3.1 "Fase 0 decision gate": if the adapter cannot communicate reliably via Web Bluetooth or Web Serial in Chrome Android, the project switches adapter or evaluates a native Android container. The BLE path only worked once wired to a native Capacitor bridge, so the container branch of that gate was taken — but sections 5.2, 13.1, 16, and RNF-005 were never rewritten to reflect it. Chrome version is no longer the compatibility axis; the Capacitor Android WebView and native plugin layer are. |
| 3 | Section 13.1 | The BLE transport double is named `WebBluetoothTransport` | The real class is `AndroidBleObdTransport` (`core/obd/transport/AndroidBleObdTransport.ts`), backed by the native Capacitor bridge `AndroidBleBridge` (`core/bluetooth/AndroidBleBridge.ts`). It is not a Web Bluetooth API implementation — the browser API is unavailable inside the Capacitor Android WebView for this use case. |

## State model: spec `SessionController` vs. repo `ObdSessionStateMachine`

The spec's `SessionController` names 9 states. The repository's
`ObdSessionStateMachine` (`core/obd/session/ObdSessionStateMachine.ts`) has
10 today, going to 11 once `reconnecting` ships (see the `close-phase-1`
design). The repo model is not a rename of the spec model — it splits two
spec states into finer-grained repo states and adds two repo-only states
that have no spec equivalent.

| Spec state | Repo equivalent | Why they differ |
|---|---|---|
| `idle` | `idle` | Same |
| `permission` | `selecting` + `selected` | The repo splits "the user is choosing a device" from "a device is chosen but not yet opened" — two distinct failure and retry points the spec collapses into one |
| `connecting` | `connecting` | Same |
| `initializing` | `initializing` | Same |
| — | `discovering` (repo-only) | RF-011 capability discovery (the Mode 01 PID range walk) is a distinct blocking phase with its own failure mode; the spec has no state for it |
| `ready` | `ready` | Same |
| `polling` | Not a session state — `ready` + `telemetryRunning: true` | Telemetry activity is orthogonal to link health in the repo model: polling can start and stop without the link itself changing state. The spec conflates "connected" and "actively polling" into one state |
| — | `disconnecting` (repo-only) | RF-005's safe-close window (draining in-flight commands before the link closes) is a distinct phase with no spec equivalent |
| `stopped` | `disconnected` | Same meaning, different name |
| `error` | `error` | Same |
| (not modeled) | `reconnecting` (added by `close-phase-1`) | RF-004 (reconnection) has no home in either the spec's 9 states or the repo's original 10; this change adds the one state genuinely missing from both |

**Directory naming**: spec section 16.1 names the test directory `tests/`.
The repository uses `test/`. This is intentional — no file move is planned
to match the spec, since renaming 36+ existing test files for a naming
convention has no behavioral benefit and only churns git history and import
paths.

## What is not a deviation

Everything not listed above — the read-only scope (ADR-003), local-first
architecture (ADR-001), mock/replay-first development (ADR-007), the
mandatory Convex backend (ADR-006), and the manual-knowledge-base design —
still matches the spec as written. This document only tracks points where
implementation reality has overtaken the PDF text.

## Next step

See `docs/decisions/ADR-002-obd-transport.md` for the full transport
decision and evidence, and `docs/ANDROID_BLE_CONTRACT.md` for the BLE
contract and vehicle validation status.
