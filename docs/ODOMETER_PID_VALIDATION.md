# Odometer PID validation

Does this Kia Rio expose its odometer over OBD-II?

The question matters because RF-036 shows upcoming maintenance due dates, and
a due date has two axes: a date and a mileage. If the car reports its
odometer, the mileage axis is read from the vehicle. If it does not, the only
mileage this app can ever know is the one the owner typed, and every due-date
screen has to say so rather than implying live tracking.

**Nothing here writes to the ECU.** Every command in this document is a Mode 01
read. Mode 04 is not involved and never will be.

## What is already known

| Fact | Evidence |
|---|---|
| SAE J1979 Mode 01 defines an odometer at **PID `A6`** | The standard. It lives in the `A1–C0` range, so its support bit is in the answer to `01A0`. |
| The Rio advertises that more ranges exist beyond `0x20` | `test/fixtures/kiaRio2026-08-24Session.json`: `0100` → `4100BE3EB813`. The low bit of `13` is PID `0x20`, and it is set. |
| We have never got past PID `0x20` with this car | The same capture: `0120` was sent and the next event is `error`. |
| That error was **ours**, not the car's | `PHYSICAL_ALLOWED_COMMANDS` approved only `0100` at the time — the comment in `core/obd/policy/PhysicalObdCommandPolicy.ts` names this exact date. The allowlist now includes `0120` through `01C0`. |
| Whether the Rio answers `01A0` | **Unknown.** No capture since the allowlist widened. |

**Expectation, stated in advance so a null result is not a disappointment:**
PID `A6` support is uncommon. Many manufacturers keep the odometer in a
manufacturer-specific UDS service rather than Mode 01, so the likely answer is
*no*. Likely is not known, and this check costs one command.

## Check 1 — Does the car advertise the odometer PID?

Needs the vehicle. Ignition on, engine may be idling, car stationary. No code
change: on a physical transport the manual command buttons are exactly the
read-only allowlist, so `01A0` is already one of them.

1. Connect over BLE and wait for `ready`.
2. Open **Datos**. The **PIDs compatibles** badges show everything automatic
   discovery found. If `A6` is already listed there, this check is answered —
   discovery walked the whole chain on its own.
3. If the chain stopped early, send **`01A0`** from the manual command box.
   Sending it directly does not depend on each range advertising the next.
4. Optionally walk `0120` → `0140` → `0160` → `0180` → `01A0` in order to see
   exactly how far this ECU goes.

### Reading the answer

The reply looks like `41A0 XX YY ZZ WW`. Only the first data byte matters:

    supported = (XX & 0x04) !== 0

That mask comes from the project's own decoder, not from a table:
`decodeSupportedPids` computes `pid = basePid + bitIndex + 1`, so with
`basePid = 0xA0` and `pid = 0xA6` the bit index is 5, which is byte 0, mask
`0x04`.

| What comes back | What it means | Status to record |
|---|---|---|
| `A6` appears in **PIDs compatibles** | Discovery reached the range by itself and the car advertises the odometer. | PASS |
| `41A0` with the first data byte `& 0x04` set | The car advertises the odometer PID. | PASS |
| `41A0` with that bit clear | The range exists; the odometer is not in it. | FAIL — no Mode 01 odometer |
| `NO DATA` | The ECU does not answer that range at all. | FAIL — no Mode 01 odometer |
| `?` or a garbled frame | Not an answer about support. Retry before recording anything. | INVALID |
| Nothing happens | The button did not reach the transport. A UI defect, not a vehicle result. | INVALID |

## Check 2 — Does the reported value match the dashboard? *(only if check 1 passes)*

**This check requires a deliberate code change first.** Reading the value means
sending `01A6`, and `01A6` is **not** in `PHYSICAL_ALLOWED_COMMANDS`, so the
app refuses to send it to a real vehicle. That refusal is the read-only
boundary working as designed.

Adding it is legitimate — Mode 01 writes nothing, and it is the same class of
command as `010C` — but it must be a reviewed edit to that file with a reason,
never a side effect of other work.

Then, and only then:

1. Read the odometer on the instrument cluster and write it down first.
2. Send `01A6` and decode the answer (`41A6` + 4 bytes, 0.1 km per count in
   J1979).
3. Compare.

| Result | Meaning | Status |
|---|---|---|
| Within a kilometre of the cluster | The ECU's odometer is the one the driver reads. | PASS |
| A plausible but different number | Something is being reported, but not the dashboard odometer. **Do not use it.** | FAIL |
| Zero, or an implausible value | Advertised but not populated. | FAIL |

A number arriving is not the same as the number being right. Until this check
passes, no due-date calculation may use a vehicle-sourced mileage.

## What this does NOT cover

- Manufacturer-specific UDS services. If the odometer lives there, finding it
  means probing services this project's read-only allowlist does not permit,
  and that is not a checklist item — it is a separate safety decision.
- Any Mode 04, ECU write, or actuation. Out of scope permanently.

## Results

| Check | Date | Outcome | Notes |
|---|---|---|---|
| 1 — car advertises PID `A6` | — | NOT RUN | Needs the vehicle. No code change required. |
| 2 — value matches the cluster | — | NOT RUN | Blocked on check 1 passing **and** on `01A6` being added to the allowlist. |

## What each outcome decides

- **Check 1 fails** — RF-036's mileage axis can only ever come from the owner.
  Every due-date screen must name the reading it used and when it was entered.
- **Check 1 and 2 both pass** — the mileage axis can be read from the car, and
  the owner only enters the interval and what was done.
