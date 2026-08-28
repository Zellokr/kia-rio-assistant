# ADR-003: Fase 1 closed without hardware validation

**Status**: Superseded by [ADR-004](ADR-004-part-a-closure.md)
**Date**: 2026-08-25
**Decided by**: Kristian (project owner)
**Related**: `docs/decisions/ADR-002-obd-transport.md`, `docs/SPEC_DEVIATIONS.md`, spec Annex B.1 (Sprint 0), spec section 3.1 ("Regla de avance")

## Decision

Fase 1 was declared closed as of 2026-08-25 **without executing Sprint 0 task 8**.
This was a deliberate, owner-accepted waiver. It was **not** a record that the
validation was performed.

This ADR records the state on 2026-08-25. It is superseded by ADR-004, which
records the later 2026-08-28 vehicle run: A1 met its criterion, and A2 closed
on a narrower owner waiver after two detected drops and one observed recovery.

## What was NOT done

Sprint 0 task 8 asks for **ten consecutive connections and one 30-minute
session** on the real vehicle. That has not happened and is not scheduled by
this decision.

Specifically, as of this date:

- **Reconnection has never run against the Kia Rio.** No drop, and therefore
  no recovery, has ever been observed on the car. `ObdReconnectionController`
  and its wiring are proven only against `ReplayObdTransport` and fake-timer
  unit tests.
- **Persistence has never run on the Android WebView.** It is proven against
  an in-memory adapter and `fake-indexeddb`, which is a Node polyfill. Real
  storage quota behaviour, eviction under memory pressure, and durability
  across app kills are unverified on the device.
- The only vehicle evidence that exists remains the single 91-event session of
  2026-08-24 (`test/fixtures/kiaRio2026-08-24Session.json`), during which no
  disconnection occurred.

## Why the waiver was accepted

Fase 1's code is complete: both of its open MUST requirements (RF-004
reconnection, RF-034/RF-011 persistence) are implemented, reviewed and covered
by 310 passing tests with clean lint and typecheck. The remaining gap is
hardware time, not engineering work, and it was blocking progress on later
phases for a single-person project.

The spec's own section 3.1 "Regla de avance" forbids starting a phase before
the previous one has reproducible tests and a verified exit criterion. The
reproducible tests exist. **The verified exit criterion does not.** This ADR
records that the owner chose to advance anyway, with the gap open and visible,
rather than leave the phase informally half-closed.

## Historical consequences

These consequences governed the project between 2026-08-25 and ADR-004:

- **Do not cite Fase 1 closure as evidence that reconnection works on the
  vehicle.** It was not. Any document, report or commit message from that period
  implying otherwise was wrong and should have been corrected against this ADR.
- Sprint 0 task 8 stayed **open** as a tracked item. Closing Fase 1 did not close
  it.
- The first real drop on the car was still an unrehearsed event.
- `AndroidBleObdTransport` remained the only vehicle-validated transport, for
  the initial connection path only (ADR-002).
- If the later hardware run contradicted the implemented behaviour, this ADR was
  the record explaining why that was possible: the behaviour shipped unproven,
  knowingly.

## Supersession

ADR-004 supersedes this waiver. Sprint 0 task 8 is no longer open: A1 met its
criterion, and A2 closed by owner waiver with one recovery observed and one
post-fix Bluetooth-toggle gap still not rerun on the vehicle.
