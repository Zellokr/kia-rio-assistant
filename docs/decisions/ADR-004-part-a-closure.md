# ADR-004: Part A closed on one observed recovery

**Status**: Accepted
**Date**: 2026-08-28
**Decided by**: Kristian (project owner)
**Related**: `docs/decisions/ADR-003-fase-1-closure-waiver.md`, `docs/FIELD_TEST_VEHICLE_VALIDATION.md`, spec Annex B.1 (Sprint 0 task 8)

## Decision

Part A of the vehicle field test is declared closed as of 2026-08-28.

A1 is closed **on met criteria**. A2 is closed **on an owner waiver**: its
own criterion asks for both induced drops to be detected and both recoveries
observed, and one of the two recoveries was not.

As with ADR-003, this is a record of a decision, not a record that the
validation was complete. The difference from ADR-003 is that this one rests
on vehicle evidence rather than on its absence.

## What ADR-003 listed as never tested, and now is

ADR-003 closed Fase 1 on 2026-08-25 with three specific unknowns. Two of them
are now answered by data from the car.

**Reconnection had never run against the Kia Rio.** It has now. In the
16:46 session the link dropped at 41.5 s, was detected at 43.4 s, one attempt
began at 43.9 s, and the session was back to `ready` at 47.9 s — 4.4 seconds
from detection to recovery — with telemetry restarting 2.5 seconds later.
`ObdReconnectionController` is no longer proven only against
`ReplayObdTransport` and fake timers.

**Persistence had never run on the Android WebView.** It has now. Twenty-one
sessions were written to real IndexedDB and read back to compose two field
reports.

**The only vehicle evidence was one 91-event session.** There are now
twenty-one sessions across two runs.

## The evidence

Two runs, both on the Kia Rio YB 2019 1.2 MPI over the VEEPEAK BLE adapter.

| | Run 1 · 15:04–15:06 | Run 2 · 16:44–16:48 |
|---|---|---|
| Sessions | 10 | 11 |
| Reached ready | 9, plus one never written | 11 of 11 |
| Consecutive streak | 9 | **11** |
| Drops detected | 0 | 2 |
| Recoveries | 0 | 1 |

A1 asks for ten consecutive connections. Run 2 gave eleven, with no errors
and no drift: 7.7–10.4 s to ready, and the ninth connection no slower than
the fourth. The leak this criterion exists to catch would have shown by then.

Run 1 recorded no drops because telemetry was never started, so there was
nothing to lose; that is a defect in the procedure of the day, corrected
before run 2.

## What is waived

A2's criterion: **both** drops detected and **both** recoveries observed.
Observed: two drops, one recovery.

The second drop was induced by cycling the phone's Bluetooth — a harsher
failure than the procedure asked for, which named unplugging the adapter or
walking out of range. It did not recover, and the root cause is understood:

- Android tears every GATT connection down when the adapter goes off and
  invalidates its scan results, leaving `BleObdBridgePlugin` holding
  `BluetoothDevice` handles from a stack that no longer existed.
- `connectGatt` against one of those does not fail; it waits. `isEnabled` was
  checked in `scan()` and nowhere in `connect()`.
- `ObdReconnectionController` checked its 30 s deadline only *between*
  attempts, so an attempt that never settled put the deadline permanently out
  of reach. One `reconnect-attempt` was logged where five were due, and no
  failure was ever reported.

All three are fixed (`8c88f1d`, `7b2792d`) and covered by tests that fail
against the previous code. **None of those fixes has been run on the
vehicle.** That is precisely what this waiver accepts.

## Why the waiver is acceptable here, and where it is not

What A2 exists to prove is that a lost link is noticed, retried and
recovered, and that telemetry resumes rather than leaving a stale screen
claiming to be live. The 16:46 session demonstrates every part of that
sequence end to end on the real car.

What it does not demonstrate is recovery from an adapter-stack teardown.
Anyone reading a future failure in that area should start here rather than
assume it was covered.

## Revisit

Reopen if the vehicle is available again. One induced Bluetooth toggle with a
build carrying `7b2792d` or later closes the gap; it is a minute at the car,
not a trip.
