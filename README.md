# Kia Rio Assistant

Read-only OBD-II lab for a Kia Rio YB 2019 1.2 MPI, targeting a Veepeak
OBDCheck BLE+ adapter. Phase 0 focuses on transport, ELM framing, command
queueing, and safe inspection — not AI, cloud sync, voice, or a production
dashboard.

## Stack

- Node.js 24 LTS, pnpm
- Nuxt 4, Vue 3, TypeScript
- Vitest, ESLint
- Capacitor Android shell for GATT inventory (and a future BLE OBD bridge)

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
| Web Serial / RFCOMM | Browser serial path when the platform exposes `navigator.serial` |

Physical Web Serial checks are documented in
[docs/STEP_18_PHYSICAL_TEST.md](docs/STEP_18_PHYSICAL_TEST.md) and remain
**NOT RUN** until executed against the real vehicle.

The lab is read-only: Mode 04 and other ECU-writing operations are blocked at
the physical transport boundary.

## Android GATT inventory

The Capacitor Android app can scan advertised VEEPEAK devices and discover
GATT structure only. It does **not** read or write characteristic values,
enable notifications, or send OBD commands.

```bash
pnpm build:android:web
pnpm cap:sync:android
pnpm android:open
```

Follow [docs/STEP_19_GATT_INSPECTION.md](docs/STEP_19_GATT_INSPECTION.md)
before using a phone with the adapter. Inventory status: **NOT RUN**.

## Android BLE OBD contract

The TypeScript contract for a future Android BLE `ObdTransport` is in place
(`AndroidBleBridge` + `AndroidBleObdTransport`) and covered by unit tests
with a **fake** native bridge.

Real UUID wiring, RX/TX characteristic I/O, and notifications are **not**
implemented until a reviewed VEEPEAK GATT inventory exists. See
[docs/ANDROID_BLE_CONTRACT.md](docs/ANDROID_BLE_CONTRACT.md).

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
