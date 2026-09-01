import { v } from 'convex/values'

import { mutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'

/**
 * The one write path the phone uses (RF-035).
 *
 * Every mutation here upserts on `localId`. That is what makes §15.2's
 * *"reintenta sin duplicar datos"* hold end to end: the device queue is
 * keyed by an idempotency key, and so is this table, so the same operation
 * arriving twice — because a push timed out, because the app was killed
 * mid-flight, because the acknowledgement was lost — writes the same row
 * instead of a second one.
 *
 * `pushSessions` and `pushMaintenance` return the `localId`s they durably
 * accepted, which is exactly what `SyncPushResult` asks for. Anything they do
 * not return stays queued on the device. Returning an id the write did not
 * commit would delete the driver's only copy.
 */

const sessionFields = {
  schemaVersion: v.number(),
  localId: v.string(),
  startedAt: v.string(),
  endedAt: v.union(v.string(), v.null()),
  transportKind: v.string(),
  reconnectCount: v.number(),
  truncated: v.boolean()
}

const maintenanceFields = {
  schemaVersion: v.number(),
  localId: v.string(),
  performedAt: v.string(),
  odometerKm: v.number(),
  item: v.string(),
  notes: v.union(v.string(), v.null()),
  interval: v.union(
    v.object({
      km: v.union(v.number(), v.null()),
      months: v.union(v.number(), v.null())
    }),
    v.null()
  )
}

export const pushSessions = mutation({
  args: { sessions: v.array(v.object(sessionFields)) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const accepted: string[] = []

    for (const session of args.sessions) {
      await upsert(ctx, 'sessions', session.localId, {
        ...session,
        syncedAt: Date.now()
      })
      accepted.push(session.localId)
    }

    return accepted
  }
})

export const pushMaintenance = mutation({
  args: { records: v.array(v.object(maintenanceFields)) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const accepted: string[] = []

    for (const record of args.records) {
      await upsert(ctx, 'maintenanceRecords', record.localId, {
        ...record,
        syncedAt: Date.now()
      })
      accepted.push(record.localId)
    }

    return accepted
  }
})

/**
 * §8.1: *"El usuario puede borrar una sesión, un vehículo o todos los datos
 * locales y remotos asociados."* Deleting locally is not enough — the remote
 * copy has to go too, or "delete everything" is a lie.
 */
export const deleteSession = mutation({
  args: { localId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await bylocalId(ctx, 'sessions', args.localId)

    if (existing) {
      await ctx.db.delete(existing._id)
    }

    return null
  }
})

export const deleteMaintenanceRecord = mutation({
  args: { localId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await bylocalId(ctx, 'maintenanceRecords', args.localId)

    if (existing) {
      await ctx.db.delete(existing._id)
    }

    return null
  }
})

async function bylocalId(
  ctx: MutationCtx,
  table: 'sessions' | 'maintenanceRecords',
  localId: string
) {
  return ctx.db
    .query(table)
    .withIndex('by_localId', q => q.eq('localId', localId))
    .unique()
}

async function upsert(
  ctx: MutationCtx,
  table: 'sessions' | 'maintenanceRecords',
  localId: string,
  document: Record<string, unknown>
): Promise<void> {
  const existing = await bylocalId(ctx, table, localId)

  if (existing) {
    await ctx.db.replace(existing._id, document as never)

    return
  }

  await ctx.db.insert(table, document as never)
}
