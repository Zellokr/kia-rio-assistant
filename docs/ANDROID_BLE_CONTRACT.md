# Android BLE OBD transport contract

This document holds the TypeScript contract for the Capacitor Android BLE byte
pipe feeding `ObdTransport` / `ElmCommandExecutor`.

It was originally written before any of it existed. The pipe now ships and has
answered a real vehicle, so the sections below describe what is built, not what
is planned. Read the Status block for exactly how far the hardware evidence
reaches — it is narrower than "it works".

## Status

- Contract + unit tests with a **fake native bridge**: implemented.
- Real native UUID wiring, characteristic writes, and notifications:
  implemented in `BleObdBridgePlugin` and confirmed on hardware (2026-08-24).
  An ATZ round trip over the reviewed profile answered `ELM327 v2.2`.
- Physical validation **against a vehicle**: **COMPLETE** (2026-08-24, Kia Rio
  YB 2019 1.2 MPI, parked, engine idling). `ATSP0` negotiated automatically and
  `0100` answered `4100BE3EB813` after one `SEARCHING...`, yielding 18 supported
  PIDs in range 01-20. Live telemetry decoded `410C0C4C` -> 787 rpm and
  `410571` -> 73 degrees C, both verified by hand against the OBD formulas.
- **Range walk: widened on 2026-08-25, never run on the car.** During the
  2026-08-24 session discovery stopped at PID `0x20`: the `0100` bitmask set PID
  20, so the ECU had further ranges, but `0120` was not yet allowlisted and
  `discoverSupportedPids` ended the loop cleanly on `PhysicalCommandRejectedError`
  — the read-only policy working as designed, not a defect. Commit `87f11f7` then
  approved the whole Mode 01 probe range (`0120` through `01C0`) as a deliberate
  policy decision. That commit lands **one day after** the only vehicle session
  this project has, so the widened walk has only ever run against fakes. The 18
  PIDs above are still the complete vehicle evidence.

## Layers

| Layer | Role |
|-------|------|
| `GattInspector*` | Scan VEEPEAK + discover GATT structure only (no value I/O) |
| `AndroidBleBridge` | Native byte stream contract (select / connect / write / RX) |
| `AndroidBleProfile` | Opaque service + TX/RX characteristic UUIDs |
| `AndroidBleObdTransport` | `ObdTransport` adapter (`kind: 'android-ble'`) |
| `capacitorAndroidBle` | Live Capacitor binding (`app/services/capacitorAndroidBle.ts`) onto the Kotlin `BleObdBridge` plugin |

Gatt inventory and the OBD byte pipe stay separate on purpose. Do not merge
inspect-only APIs into the OBD bridge.

## Profile rules

`AndroidBleProfile` fields:

- `serviceUuid`
- `writeCharacteristicUuid`
- `notifyCharacteristicUuid`

Rules:

1. Treat UUIDs as opaque strings.
2. Do **not** hardcode VEEPEAK (or any vendor) UUIDs in application defaults.
3. Supply a profile only after reviewing a real Step 19 inventory.
4. Unit tests may use clearly synthetic fixture UUIDs.

`AndroidBleObdTransport.connect()` rejects with an actionable error when the
profile is missing or blank.

## Bridge methods

```ts
interface AndroidBleBridge {
  isSupported(): boolean
  requestDevice(): Promise<{ id: string, name?: string }>
  connect(options: {
    deviceId: string
    profile: AndroidBleProfile
  }): Promise<void>
  disconnect(): Promise<void>
  write(data: Uint8Array): Promise<void>
  subscribe(listener: (data: Uint8Array) => void): () => void
}
```

The transport maps:

- `select()` → `requestDevice()`
- `connect()` → `connect({ deviceId, profile })` + bridge `subscribe`
- `write()` → allowlisted physical commands only, then `bridge.write`
- bridge RX chunks → transport `subscribe` listeners
- `disconnect()` / `error` → `subscribeState` (executor fails in-flight work)

## Standing rules

The first and third bullets of this section were "must not ship yet" gates.
Both were cleared deliberately, on inventory evidence, and the plugin and the
lab option now ship. What remains is a permanent rule, not a gate:

- Never assume Nordic UART or "standard ELM BLE" UUID sets without inventory
  proof. Profiles come from a real Step 19 inventory or they do not come at all.
- Never let the lab UI imply more physical readiness than the Status block
  supports. Initial connection is proven; reconnection is not (see
  [ADR-003](decisions/ADR-003-fase-1-closure-waiver.md)).

## How to test without a car

Use a fake `AndroidBleBridge` in Vitest (see
`test/unit/androidBleObdTransport.test.ts`):

1. Inject synthetic profile UUIDs.
2. Drive `select` → `connect` → fragmented RX → `disconnect` → reconnect.
3. Confirm `ElmCommandExecutor` still works and rejects on disconnect.

```bash
pnpm exec vitest run test/unit/androidBleObdTransport.test.ts
```

## Build-out status

The inventory sequence this document was written to gate is complete:

1. ~~Complete [Step 19](STEP_19_GATT_INSPECTION.md) and save the JSON inventory.~~ Done.
2. ~~Choose write + notify characteristics from that evidence.~~ Done.
3. ~~Implement the real Capacitor plugin behind `AndroidBleBridge`.~~ Done —
   `android/app/src/main/java/dev/krist/kiarioassistant/plugins/BleObdBridgePlugin.kt`.
4. ~~Expose the transport in `/` and run a physical checklist.~~ Exposed, and
   run once on 2026-08-24.

Still outstanding: Sprint 0 task 8 — ten consecutive connections plus one
30-minute session including a drop and a recovery. It is **open**, waived rather
than executed by [ADR-003](decisions/ADR-003-fase-1-closure-waiver.md).
