# Convex sync device validation

Does the synchronisation work **on the phone**?

Everything about the sync path has been proven twice already, and neither
proof was a device. The unit suite covers the queue and the target against
fakes, and on 2026-09-02 the mutations were exercised against the live
deployment — but by the CLI, from a development machine.

That is the same standing this project's TTS had the day before it shipped
inert. [ADR-012](decisions/ADR-012-on-device-speech.md) established the
standard the hard way: **shipped code that has never run on the device proves
nothing.** `window.speechSynthesis` was assumed present in this Capacitor
WebView and was not.

None of these checks needs the car. Check 2 is the only one that wants a
vehicle session, and a mock transport produces one just as well.

## What could plausibly fail, and why the WebView is the question

The APK loads its assets from `https://localhost` — Capacitor's default
Android scheme, since `capacitor.config.ts` declares no `server` block. So
every Convex request leaves the WebView with that origin. `INTERNET` is
granted in the manifest, there is no `networkSecurityConfig`, and Convex is
HTTPS/WSS so no cleartext exemption is needed.

None of that is proof. The Web Speech API was present, unprefixed and
standard too, and half of it did not exist in this container.

## Quick path

1. Install the current debug APK: `pnpm android:build:debug`.
2. Run check 1. It takes seconds and it decides whether the rest is worth
   running.
3. Record every outcome in the results table, verbatim where the app prints
   a reason.

## Check 1 — Does the app reach Convex from the WebView?

Open **Registro**. The **Sincronización** panel drains once when the screen
opens.

| What the panel says | What it means | Status |
|---|---|---|
| *"No hay nada pendiente de sincronizar"* and no error | Nothing was owed, so nothing was proven yet. Go to check 2. | INCONCLUSIVE |
| *"Se sincronizaron N de N"* | The WebView reached Convex and the deployment accepted the rows. | PASS |
| *"No se pudo sincronizar: …"* | It reached the code but not the backend. **The reason is the finding** — copy it verbatim. | FAIL, with reason |
| The screen is blank or the app closes | Not a sync result. Report as a UI defect. | INVALID |

## Check 2 — Does a real session reach the deployment?

1. Connect a transport — the mock is enough — so a session opens. The session
   is queued the moment it opens, not when it ends.
2. Open **Registro**. The pending count should be at least 1 before the drain
   finishes.
3. Press **Sincronizar ahora**.
4. Confirm the row in the Convex dashboard, under `sessions`, matching the
   session id.

| Outcome | Status |
|---|---|
| The row is in the dashboard and the count falls to zero | PASS |
| The count falls to zero but no row appears | **FAIL, and the worst kind**: the queue was emptied without the data arriving. Stop and report. |
| The count stays and an error is shown | FAIL, with the reason |

## Check 3 — Does an offline queue survive and drain later? *(T-011)*

The acceptance test the spec names for a backend outage:
*"Convex no disponible. La operación queda en cola sin perder datos."*

1. Put the phone in airplane mode.
2. Record a maintenance entry in **Registro**.
3. The pending count must rise. Nothing may be lost and no error may block
   the save — the record is written locally first.
4. Turn airplane mode off.
5. The panel drains on the `online` event without being touched.

| Outcome | Status |
|---|---|
| Saved offline, count rises, drains by itself when the connection returns | PASS |
| Saved offline but never drains until the app is reopened | PARTIAL — the `online` event did not fire in this WebView |
| The save fails while offline | **FAIL** — local persistence must not depend on the network |

## Check 4 — Does the app still work with Convex unreachable? *(§9.5)*

With airplane mode on, confirm the rest of the app is unaffected: telemetry,
DTC reads, the local assessment and the maintenance history all keep working.
§9.5 calls degraded mode *"una medida de resiliencia"*, and the OBD path must
not notice that sync is down at all (§6, R-09).

## Check 5 — Does the queue survive the app being killed?

1. Queue something with airplane mode on.
2. Kill the app from the recents screen.
3. Reopen it and go to **Registro**.

The pending count must be what it was. The queue lives in IndexedDB precisely
so a killed WebView does not lose it, and a session is queued when it opens
for exactly this case.

## What is NOT covered here

- Authentication. There is none, deliberately —
  [ADR-015](decisions/ADR-015-no-backend-auth.md).
- Convex's own durability. If the dashboard shows the row, it arrived; what
  happens after that is Convex's problem, not this app's.
- Conflict resolution between two devices. There is one device.

## Results

| Check | Date | Outcome | Notes |
|---|---|---|---|
| 1 — reaches Convex from the WebView | 2026-09-02 | PASS | Pixel 9a debug APK reached Convex from the Android WebView. After the accepted-id and maintenance-producer fixes, the app drained pending rows and then synced a new owner-entered maintenance record, showing `Se sincronizaron 1 de 1` and leaving `syncQueue` empty. |
| 2 — a real session reaches the deployment | 2026-09-02 | NOT RUN | No vehicle/BLE adapter session was opened in this run. An instrumented WebView session row was accepted by Convex during diagnosis, but it is not vehicle evidence. |
| 3 — offline queue survives and drains | — | NOT RUN | Offline/airplane-mode recovery was not exercised in this run. The online maintenance producer path is now proven to enqueue and drain on the phone. |
| 4 — app unaffected while sync is down | — | NOT RUN | |
| 5 — queue survives the app being killed | — | NOT RUN | |

### 2026-09-02 Android WebView finding before the fix

Device: Pixel 9a over Windows ADB, app `dev.krist.kiarioassistant`, debug APK
built with `pnpm android:build:debug` and installed with `adb install -r`.
The WebView was inspected through Chrome DevTools Protocol.

Evidence captured from the WebView:

- The production APK opened **Registro** and initially showed
  `No hay nada pendiente de sincronizar.` / `No había nada pendiente.`
- Saving a maintenance record through the visible form wrote the row to
  IndexedDB and showed `Registro guardado`, but `syncQueue` remained empty.
- After inserting bounded validation rows into IndexedDB to exercise the drain
  path, the WebView sent:
  - `sync:pushSessions` with local id
    `device-validation-session-1788365697936`; Convex answered
    `success: true` with result `["device-validation-session-1788365697936"]`.
  - `sync:pushMaintenance` with local id
    `maintenance:1788365618947:1`; Convex answered `success: true` with result
    `["maintenance:1788365618947:1"]`.
- The app then displayed `Se sincronizaron 0 de 2`, and IndexedDB still held both
  operations with incremented attempts.

This proved the Android WebView could reach the Convex deployment, but RF-035
was not functionally closed yet: accepted rows were not removed from the queue,
and the maintenance producer path was not queuing owner-entered maintenance
records.

### 2026-09-02 Android WebView validation after the fix

The APK was rebuilt with `pnpm android:build:debug`, installed with
`adb install -r`, and reopened on the same Pixel 9a. The WebView was again
inspected through Chrome DevTools Protocol.

Evidence captured from the fixed WebView:

- Opening **Registro** drained the previously pending validation operations;
  `syncQueue` was empty after the initial drain and the **Sincronizar ahora**
  button was enabled again.
- Saving a new maintenance record through the visible form created a durable
  queue operation:
  `maintenance:maintenance:1788366616493:1`.
- Pressing **Sincronizar ahora** sent `sync:pushMaintenance` with local id
  `maintenance:1788366616493:1`; Convex answered `success: true` with result
  `["maintenance:1788366616493:1"]`.
- The app displayed `Se sincronizaron 1 de 1`, then
  `No hay nada pendiente de sincronizar.`, and `syncQueue` was empty.
- During the run, the Convex WebSocket closed once with code `1006` and later
  reconnected. The drain no longer remained stuck: the fixed build includes a
  bounded sync-push timeout so a never-resolving remote push releases the UI and
  records a failed attempt instead of leaving the button disabled indefinitely.

This proves check 1 on the Android WebView and proves the online maintenance
producer/drain path on the phone. It still does not close check 2 because no
real BLE/vehicle session was opened in this run, and it does not close check 3
because airplane-mode recovery was not exercised.

**Until a real or supported mock session queues and drains successfully on the
phone, RF-035 is not fully closed**, and Fase 4 must not be reported as closed on
check 1 alone.
