import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * What leaves the phone.
 *
 * Spec §5 names exactly two things to synchronise: *"Guardar sesiones y
 * mantenimientos localmente y sincronizarlos obligatoriamente con Convex"*.
 * Nothing else is eligible, and the omissions are the point:
 *
 * - **No session events and no telemetry samples.** §8.1 forbids Convex
 *   receiving high-frequency samples without aggregation, and those are the
 *   two stores that grow per second of driving.
 * - **No diagnostic evaluations.** They are derived from codes this app
 *   already holds, and §5 does not list them.
 * - **No audio, no VIN, no location.** §8.1's retention rule says audio is
 *   never stored at all.
 *
 * Every row carries `schemaVersion` because §8.1 requires it *"para
 * migraciones locales y remotas"*, and `localId` because §15.2 requires
 * retrying *"sin duplicar datos"* — the local id is the idempotency key, and
 * every write upserts on it.
 */
export default defineSchema({
  sessions: defineTable({
    schemaVersion: v.number(),
    /** `sessionId` on the device. The idempotency key for this table. */
    localId: v.string(),
    startedAt: v.string(),
    endedAt: v.union(v.string(), v.null()),
    transportKind: v.string(),
    reconnectCount: v.number(),
    /** True when the device dropped events to stay inside its own cap. */
    truncated: v.boolean(),
    syncedAt: v.number()
  }).index('by_localId', ['localId']),

  maintenanceRecords: defineTable({
    schemaVersion: v.number(),
    /** The record id on the device. The idempotency key for this table. */
    localId: v.string(),
    performedAt: v.string(),
    odometerKm: v.number(),
    item: v.string(),
    notes: v.union(v.string(), v.null()),
    /**
     * Stated by the owner, never by Kia. The manual this project can reach
     * carries no `/ToUnicode` map, so intervals are typed by the person who
     * holds the service book — see `docs/PHASE_ROADMAP.md`.
     */
    interval: v.union(
      v.object({
        km: v.union(v.number(), v.null()),
        months: v.union(v.number(), v.null())
      }),
      v.null()
    ),
    syncedAt: v.number()
  }).index('by_localId', ['localId'])
})
