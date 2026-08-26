# Kia Rio Assistant

Read-only OBD-II lab for a Kia Rio YB 2019 1.2 MPI, targeting a Veepeak
OBDCheck BLE+ adapter. Phase 0 focuses on transport, ELM framing, command
queueing, and safe inspection — not AI, cloud sync, voice, or a production
dashboard.

## Stack

- Node.js 24 LTS, pnpm
- Nuxt 4, Vue 3, TypeScript
- Vitest, ESLint
- Capacitor Android shell for GATT inventory and the BLE OBD bridge

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

Open `http://localhost:3000/lab` for the OBD lab UI.

## OBD lab (`/lab`)

Supported transports today:

| Transport | Purpose |
|-----------|---------|
| Mock | Synthetic ELM responses for UI and protocol work |
| Replay | Replays a recorded schema-v1 session export |
| VEEPEAK Bluetooth LE | Native Android transport (`android-ble`); the only physical transport |

`android-ble` is the sole entry in `PHYSICAL_TRANSPORT_KINDS`
(`core/obd/transport/ObdTransport.ts`). A Web Serial / RFCOMM transport used to
exist and was **deleted** on 2026-08-25: native Web Serial is desktop-only, so it
could never execute inside the Capacitor Android app, and the owned VEEPEAK
adapter is BLE rather than classic-Bluetooth RFCOMM. The evidence trail is in the
amendment to [docs/decisions/ADR-002-obd-transport.md](docs/decisions/ADR-002-obd-transport.md);
[docs/STEP_18_PHYSICAL_TEST.md](docs/STEP_18_PHYSICAL_TEST.md) is the obsolete
checklist for that removed path, kept only as history.

What the Bluetooth LE path actually proved: on 2026-08-24 the Kia Rio answered
over it while parked and idling, returning live RPM and coolant temperature, in a
single 91-event session during which nothing disconnected. That is evidence for
the **initial connection path only**. Reconnection and IndexedDB persistence
shipped in Fase 1 and have **never run against the vehicle** — see
[docs/decisions/ADR-003-fase-1-closure-waiver.md](docs/decisions/ADR-003-fase-1-closure-waiver.md).
See also [docs/ANDROID_BLE_CONTRACT.md](docs/ANDROID_BLE_CONTRACT.md).

The lab is read-only. Only a closed allowlist of commands may reach a physical
transport; Mode 04 and every other ECU-writing operation is blocked in
`core/obd/policy/PhysicalObdCommandPolicy.ts`, below the UI, so no caller can
bypass it by skipping a disabled control.

## Android GATT inventory

The Android app ships two deliberately separate Bluetooth surfaces. The **GATT
inspector** scans advertised VEEPEAK devices and discovers GATT structure only:
it never reads or writes characteristic values, enables notifications, or sends
OBD commands. The **OBD byte pipe** described in the next section is what
actually carries commands. Keeping them apart is intentional — do not merge the
inspect-only API into the bridge.

```bash
pnpm build:android:web
pnpm cap:sync:android
pnpm android:open
```

Follow [docs/STEP_19_GATT_INSPECTION.md](docs/STEP_19_GATT_INSPECTION.md)
before using a phone with a new adapter. Inventory status for the current
VEEPEAK: **COMPLETE** (2026-08-24, reviewed against
[docs/GATT_INVENTORY_SCHEMA.md](docs/GATT_INVENTORY_SCHEMA.md)).

## Android BLE OBD contract

`AndroidBleBridge` + `AndroidBleObdTransport` define the transport contract and
are covered by unit tests against a fake native bridge. The native byte pipe is
implemented in `BleObdBridgePlugin.kt` and confirmed on hardware: an `ATZ` round
trip answered `ELM327 v2.2`, and a full session reached the vehicle.

The service and characteristic UUIDs live in `app/services/veepeakBleProfile.ts`,
derived from a reviewed inventory. Nothing under `core/` ships a vendor default —
the profile is injected, so an unreviewed adapter cannot silently acquire one.
See [docs/ANDROID_BLE_CONTRACT.md](docs/ANDROID_BLE_CONTRACT.md).

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Nuxt dev server |
| `pnpm test` | Vitest unit suite |
| `pnpm run typecheck` | Nuxt / `vue-tsc` typecheck |
| `pnpm run lint` | ESLint |
| `pnpm build` | Production web build |
| `pnpm build:android:web` | Static web bundle for Capacitor |
| `pnpm cap:sync:android` | Build web + `cap sync android` |
| `pnpm android:open` | Open the Android project in Android Studio |

## License

See [LICENSE](LICENSE).
