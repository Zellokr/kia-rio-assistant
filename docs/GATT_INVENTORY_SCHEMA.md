# GATT inventory JSON schema and review criteria

This document defines the exact JSON shape produced by the Android GATT
inspector and the **objective criteria** to review it before any BLE
`ObdTransport` is designed. It exists so the Step 19 evidence has a fixed
acceptance checklist instead of a subjective "paste the JSON here".

The authoritative source of truth is the TypeScript type `GattInventory` in
`core/bluetooth/GattInspectorController.ts`. This document must stay in sync
with it. Inventory capture status remains **NOT RUN**; nothing here asserts a
confirmed VEEPEAK UUID.

## Schema

```jsonc
{
  "device": {
    "id": "string",            // Opaque platform device id. Not a MAC to store.
    "name": "string?",         // Advertised name, e.g. "VEEPEAK".
    "rssi": 0                   // Optional signal strength in dBm.
  },
  "services": [
    {
      "uuid": "string",        // 128-bit GATT service UUID (lowercase).
      "characteristics": [
        {
          "uuid": "string",    // 128-bit GATT characteristic UUID (lowercase).
          "properties": {
            "read": false,
            "write": false,
            "writeWithoutResponse": false,
            "notify": false,
            "indicate": false
          },
          "descriptors": [
            { "uuid": "string" }
          ]
        }
      ]
    }
  ]
}
```

### Field rules

- `device.id` is an opaque, platform-scoped handle. Do not treat it as a MAC
  address and do not persist it as personal data.
- `services` and `characteristics` are ordered exactly as discovered; keep the
  order when reviewing so a re-capture is comparable.
- Every `properties` flag is a boolean and always present.
- `descriptors` may be an empty array.
- All UUIDs are full 128-bit strings. A 16-bit short form (e.g. `ffe0`) must be
  expanded to its 128-bit base before comparison.

## Review checklist (objective, pass/fail)

A capture is reviewable only when **all** of the following hold. Record the
answer to each item with the concrete UUID it refers to.

1. `device.name` explicitly identifies the adapter as the VEEPEAK. If it does
   not, stop — the wrong device was inspected.
2. At least one service is present with at least one characteristic.
3. Exactly one **write path** candidate exists: a characteristic whose
   `write` **or** `writeWithoutResponse` is `true`. Record its service and
   characteristic UUID. This is the future TX (command-out) channel.
4. Exactly one **notify path** candidate exists: a characteristic whose
   `notify` **or** `indicate` is `true`. Record its service and characteristic
   UUID. This is the future RX (response-in) channel.
5. The TX and RX candidates from (3) and (4) belong to the **same** service
   UUID. A serial-bridge profile pairs them under one service; a split across
   services must be flagged for manual review.
6. No characteristic required for command I/O is missing its expected property
   (a write channel that only exposes `read` is a red flag).

If more than one write candidate or more than one notify candidate exists, do
not guess. List every candidate and stop for human review — picking the wrong
pair is how a read-only lab accidentally writes to an ECU.

## Candidate UUIDs to verify, never assume

Serial-over-BLE bridges in this adapter class commonly expose a vendor service
carrying one write characteristic and one notify characteristic. Treat any
specific UUID (including the frequently seen `ffe0`/`ffe1` pair) strictly as a
hypothesis to **confirm against the captured inventory**, not as a fact to hard
code. The reviewed inventory is the only authority for the real UUIDs.

## Out of scope for this evidence

- Reading or writing characteristic values.
- Subscribing to notifications.
- Sending any ELM/OBD command.
- Inferring vehicle-specific behavior. Kia-specific logic never belongs in the
  transport or inventory layer.
