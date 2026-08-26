# DTC physical validation

**Status: OPEN — NOT RUN.** This document is live. Nothing here has been
executed against the Kia Rio.

It holds the vehicle checks the DTC decoders need before their unvalidated
branches can be trusted. The step-by-step procedure that runs them, together
with the still-open Sprint 0 task 8, is
[`FIELD_TEST_VEHICLE_VALIDATION.md`](FIELD_TEST_VEHICLE_VALIDATION.md) —
check 2 is Part B there, check 1 is Part D. These checks are **transport-independent**: they are
about ELM327 and ECU framing, not about how bytes reach the adapter. They apply
to whatever transport is current — today that is `android-ble`, the only entry
in `PHYSICAL_TRANSPORT_KINDS`.

> **Why this file exists.** The Mode 03 multi-frame check below used to live
> inside step 5 of `STEP_18_PHYSICAL_TEST.md`, a Web Serial procedure. That
> transport was deleted on 2026-08-25 and its document was marked obsolete on
> 2026-08-26, which buried a live check that `core/obd/decoder/decodeMode03Response.ts`
> points at from its own source comment. The check was never Web-Serial-specific;
> it was only ever filed there. Moving it here restores the pointer.

## Check 1 — Mode 03 multi-frame framing

**Status: OPEN.** Blocks widening `decodeMode03Response`.

`decodeMode03Response` is validated for a single-frame SAE J1979 / ISO 15765-4
response only: up to three 2-byte DTC pairs following `0x43` directly, unused
slots padded with `0x00`, and **no** leading DTC-count byte.

Multi-frame responses — more than three stored DTCs — are not validated. CAN
ISO-TP framing and a possible DTC-count byte change the byte layout, and some
stacks (python-OBD among them) strip a count byte after `0x43`. Whether this
adapter and this vehicle emit one is unconfirmed.

**Do not widen the decoder to strip a count byte without the evidence below.**
Guessing would corrupt the common single-frame case, which is the one that
currently works.

To run it, the vehicle needs **more than three stored DTCs**. That is the hard
part: a healthy car will not produce them on demand, and this project never
induces faults. Take the opportunity if it ever arises.

1. With the session `ready`, send `03`.
2. Save the response **unedited — every line**, not a summary.
3. Compare the codes against a reference tool read from the same vehicle in the
   same state.
4. Record whether a count byte or ISO-TP framing appears after `0x43`.
5. Attach the raw capture to the result. A conclusion without the raw bytes is
   not evidence.

## Check 2 — Mode 07 and Mode 0A empty-result behaviour

**Status: OPEN.** Blocks any assumption about pending and permanent reads.

Neither Mode 07 (pending) nor Mode 0A (permanent) has ever been sent to this
vehicle. Both are now in `PHYSICAL_ALLOWED_COMMANDS` — the allowlist was
deliberately widened on 2026-08-26 — so this check is now runnable. Being
sendable is not being validated: nothing below has been executed.

The open question is what they return when there is nothing to report. Mode 03
copes with an empty result because the ECU still answers a padded
`43 00 00 00 00 00 00` frame. `classifyElmResponse` treats a literal `NO DATA`
as a **hard error** for every command, globally — so if Mode 07 or Mode 0A
answers `NO DATA` on an empty set instead of a padded frame, "no pending codes"
would surface to the user as a failure.

There is a third possible answer: the ECU may not implement the mode at all and
reply `?`, which `classifyElmResponse` reports as `unknown-command`. That is a
different fact from an empty result and must not be collapsed into it.

`readDiagnosticCodes` already handles all three without asserting which one this
vehicle produces: a padded frame reports `no-codes-reported`, a `NO DATA`
rejection reports `unconfirmed / no-data`, and a `?` rejection reports
`unconfirmed / unsupported-mode`. **`unconfirmed` is never rendered as "no
codes".** Running this check does not change that code; it records which branch
the vehicle actually takes, so the UI copy can stop hedging.

Do not assert either behaviour in code or in documentation before this runs.

1. With the session `ready`, send `07`, then `0A`.
2. Record the raw response for each, including the case where the vehicle has no
   pending or permanent codes.
3. Note which of the three the reply is: a padded frame, `NO DATA`, or `?`.
4. If it is `NO DATA`, confirm the empty case stays handled above the executor —
   record that as the finding rather than loosening the global error
   classification.
5. If it is `?`, record that this ECU does not implement the mode, and for which
   of the two modes. Do not remove the command from the allowlist on that basis
   alone: an unimplemented read is harmless, and one capture is not a fleet.
6. Attach the raw capture. A conclusion without the raw bytes is not evidence.

## Safety

Unchanged from every physical procedure in this project. The lab is read-only:
Mode 04, DTC clearing, ECU writes, coding and adaptation are forbidden, and
`PhysicalObdCommandPolicy` enforces that below the UI. Vehicle immobilised,
parking brake on, ventilated area. Stop the test rather than improvise.

## Recording a result

When a check runs, record it as a new ADR — pass or fail — and change its status
here from OPEN to the ADR reference. A check is closed by evidence, never by a
decision to stop worrying about it.
