# Android BLE OBD transport contract

This document freezes the TypeScript contract for a future Capacitor Android
BLE byte pipe that will feed `ObdTransport` / `ElmCommandExecutor`.

It is **not** a claim that VEEPEAK BLE OBD works in the app today.

## Status

- Contract + unit tests with a **fake native bridge**: implemented.
- Real native UUID wiring, characteristic writes, and notifications:
  **blocked** until a Step 19 GATT inventory is captured and reviewed.
- Physical validation against a vehicle: **NOT RUN**.

## Layers

| Layer | Role |
|-------|------|
| `GattInspector*` | Scan VEEPEAK + discover GATT structure only (no value I/O) |
| `AndroidBleBridge` | Future native byte stream (select / connect / write / RX) |
| `AndroidBleProfile` | Opaque service + TX/RX characteristic UUIDs |
| `AndroidBleObdTransport` | `ObdTransport` adapter (`kind: 'android-ble'`) |
| `capacitorAndroidBle` | Capacitor stub: detectable on Android, I/O throws until inventory |

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

## What must not ship yet

- Kotlin/Capacitor plugin that enables notifications or writes characteristics
- Assumed Nordic UART / “standard ELM BLE” UUID sets without inventory proof
- Lab UI option that implies Android BLE OBD is physically ready

## How to test today

Use a fake `AndroidBleBridge` in Vitest (see
`test/unit/androidBleObdTransport.test.ts`):

1. Inject synthetic profile UUIDs.
2. Drive `select` → `connect` → fragmented RX → `disconnect` → reconnect.
3. Confirm `ElmCommandExecutor` still works and rejects on disconnect.

```bash
pnpm exec vitest run test/unit/androidBleObdTransport.test.ts
```

## Next step after inventory

1. Complete [Step 19](STEP_19_GATT_INSPECTION.md) and save the JSON inventory.
2. Choose write + notify characteristics from that evidence.
3. Implement the real Capacitor plugin behind `AndroidBleBridge`.
4. Only then expose the transport in `/lab` and run a physical checklist.
