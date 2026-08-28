# Capture the VEEPEAK GATT inventory safely

This first Capacitor Android slice discovers only the BLE structure advertised
by the VEEPEAK. It does **not** read or write characteristic values, subscribe
to notifications, send ELM commands, or use `ObdTransport`.

> **The in-app inspector was removed on 2026-08-28.** `GattInspectorPanel`,
> `useGattInspector`, `GattInspectorController` and `GattInspectorPlugin` are
> gone: the inspection below completed, its result is the constant
> `VEEPEAK_BLE_PROFILE`, and what remained on the connection screen was a
> second "Buscar…" button beside the real one doing something entirely
> different. To re-run this for another adapter or after a firmware change,
> restore them from git — `git log --diff-filter=D -- '*GattInspector*'`
> finds the commit — or capture the inventory with nRF Connect and review it
> against [GATT_INVENTORY_SCHEMA.md](GATT_INVENTORY_SCHEMA.md).

Physical inspection status: **COMPLETE** (2026-08-24, Google Pixel 9A /
Android 17). The captured inventory was reviewed against
[GATT_INVENTORY_SCHEMA.md](GATT_INVENTORY_SCHEMA.md) and the resulting serial
pipe was confirmed by an ATZ round trip answering `ELM327 v2.2`. Re-run this
procedure for any other adapter, or after a firmware change.

## Prepare the Android build

1. Install Android Studio with Android SDK 36 and JDK 17.
2. Generate the embedded web bundle and synchronize Android:

   ```bash
   pnpm cap:sync:android
   ```

3. Open the native project:

   ```bash
   pnpm android:open
   ```

4. Build and install the debug application on the Android device.

## Inspect the adapter (historical in-app procedure)

The steps below describe the removed in-app **Inventario Bluetooth** workflow.
They are non-executable in the current app unless the inspector is restored from
git. For a current rerun without restoring code, capture the same inventory with
nRF Connect and compare it to [GATT_INVENTORY_SCHEMA.md](GATT_INVENTORY_SCHEMA.md).

1. Park the vehicle completely and apply the parking brake.
2. Keep the engine off. Plug the VEEPEAK into the OBD-II port only to power it.
3. Completely close every other OBD or Bluetooth scanner application. Only one
   application may hold the adapter connection.
4. Open **Kia Rio Assistant**, navigate to `/`, and select the **Conexión**
   tab, which is the view the lab opens on. Locate the **Inventario Bluetooth**
   card, badged *No lee ni escribe datos del vehículo*.
5. Confirm that the card does not show the *Abre esta sección desde la
   aplicación Android* notice. That notice means the inspector is running in a
   browser instead of the native Android application, and no inventory can be
   captured there.
6. Tap **Buscar VEEPEAK** and grant the nearby-device permission. Android 11 or
   older may show the legacy location permission required by BLE scanning; the
   application does not read or store GPS location.
7. Wait five seconds. Confirm the advertised name and address shown in the
   device selector. Do not continue if the device is not explicitly identifiable
   as VEEPEAK.
8. Select that device yourself. The application never selects or connects to the
   first scan result automatically.
9. Tap **Descubrir inventario** once. Wait for the structured JSON.
10. Tap **Copiar inventario** and save the result locally.
11. Tap **Desconectar Bluetooth** and confirm the disconnected status.
12. Unplug the adapter when finished.

## Return this evidence

Provide:

- Android version and phone model.
- Advertised device name.
- The complete copied JSON inventory.
- Any permission, scan, connection, or discovery error shown exactly as written.
- Confirmation that **Desconectar Bluetooth** completed.

Do not send an OBD command yet. The inventory must be reviewed before a BLE
transport is designed or connected to the ELM command pipeline. Review the
copied JSON against the schema and objective pass/fail checklist in
[GATT_INVENTORY_SCHEMA.md](GATT_INVENTORY_SCHEMA.md).

## Stop conditions

Stop without retrying unknown operations if the adapter is absent, a different
device is shown, permission is denied unexpectedly, connection repeatedly fails,
discovery returns an unsafe or uninterpretable result, or disconnection fails.
