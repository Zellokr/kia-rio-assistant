# DTC physical validation

**Status: PARTLY RUN, 2026-08-28.** Check 2 is closed; check 1 is not
executable on this car. See the per-check status below.

It holds the vehicle checks the DTC decoders need before their unvalidated
branches can be trusted. The step-by-step procedure that ran the executable
check and recorded the non-executable one is
[`FIELD_TEST_VEHICLE_VALIDATION.md`](FIELD_TEST_VEHICLE_VALIDATION.md) —
check 2 is Part B there, check 1 is Part D. These checks are
**transport-independent**: they are about ELM327 and ECU framing, not about how
bytes reach the adapter. They apply to whatever transport is current — today
that is `android-ble`, the only entry in `PHYSICAL_TRANSPORT_KINDS`.

> **Why this file exists.** The Mode 03 multi-frame check below used to live
> inside step 5 of `STEP_18_PHYSICAL_TEST.md`, a Web Serial procedure. That
> transport was deleted on 2026-08-25 and its document was marked obsolete on
> 2026-08-26, which buried a live check that `core/obd/decoder/decodeMode03Response.ts`
> points at from its own source comment. The check was never Web-Serial-specific;
> it was only ever filed there. Moving it here restores the pointer.

## Check 1 — Mode 03 multi-frame framing

**Status: NOT EXECUTABLE on this vehicle, 2026-08-28.** Mode 03 answered
with zero stored codes, so there is no multi-frame response to read. Still
blocks widening `decodeMode03Response` — it waits for a car with a real
fault, not for a decision.

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

**Status: CLOSED 2026-08-28.** This ECU answers `03`, `07` and `0A` with a
padded frame — a decodable response carrying zero codes — not `NO DATA` and
not `?`.

The evidence is that the reads were logged at all:
`readDiagnosticTroubleCodes` records a `decoded-value` event only when the
outcome is `codes`, and returns before that for the other two branches.
Eight such events sit in the 16:48 session — two for `03`, three for `07`,
three for `0A`. All three branches remain implemented; this records which
one this car takes, not that the others are dead code.

Before the 2026-08-28 run, the open question was what this ECU would return
when there was nothing to report. It could have returned the padded empty frame
Mode 03 already used, a literal `NO DATA`, or `?` for an unsupported mode. Those
branches remain distinct in code because other ECUs may choose differently:

- a padded frame reports `no-codes-reported`;
- a `NO DATA` rejection reports `unconfirmed / no-data`;
- a `?` rejection reports `unconfirmed / unsupported-mode`.

For this Kia Rio, that question is closed: all three diagnostic modes reached
the decoded `codes` path with zero reported DTCs. Do not generalise this to all
vehicles, and do not remove the other branches.

## Safety

Unchanged from every physical procedure in this project. The lab is read-only:
Mode 04, DTC clearing, ECU writes, coding and adaptation are forbidden, and
`PhysicalObdCommandPolicy` enforces that below the UI. Vehicle immobilised,
parking brake on, ventilated area. Stop the test rather than improvise.

## Recording a future result

If Check 1 ever becomes executable on this or another vehicle, record it as a
new ADR — pass or fail — and change its status here from NOT EXECUTABLE to the
ADR reference. A check is closed by evidence, never by a decision to stop
worrying about it.
