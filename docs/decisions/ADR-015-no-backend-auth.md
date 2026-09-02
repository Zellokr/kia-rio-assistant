# ADR-015: The Convex deployment runs without authentication

**Status**: Accepted
**Date**: 2026-09-02
**Decided by**: Kristian (project owner)
**Related**: [ADR-014](ADR-014-fase-4-opening.md), `docs/PHASE_ROADMAP.md`, spec §5, §8.1, RF-035, RNF-006

## Decision

The Convex deployment that receives sessions and maintenance records runs
with **no authentication**. Better Auth is not installed and no auth proxy
exists; `@lupinum/better-convex-nuxt` is configured as the documented
Convex-only build.

The owner is the only user of this application.

## What the risk actually is

Not "another user of the app". The app has one user by construction, so user
isolation buys nothing.

The real exposure is the deployment URL. It travels inside the APK because
the client has to know the address it talks to, and a Convex URL is public by
design — RNF-006 keeps every *secret* server-side, and this URL is not one.
So anyone holding that string can write to these tables.

## Why that is accepted here

- The APK is side-loaded on the owner's phone. It is not on any store and is
  not distributed.
- The tables hold OBD session summaries and the owner's own maintenance
  history. No credentials, no location, no audio — §8.1 rules audio out
  entirely and the schema carries neither VIN nor position.
- The worst outcome is polluted or deleted rows for one car, against a device
  that keeps the authoritative copy locally in IndexedDB. Convex is the
  synchronised history, not the only one.
- Verified on 2026-09-02: `.output/` and
  `android/app/src/main/assets/public` are both gitignored, and no tracked
  file contains `convex.cloud`. The URL cannot reach the public repository
  through a build artefact.

## What would reopen this

Any of these, and the decision has to be taken again rather than inherited:

1. **The APK is distributed to anyone else**, published, or put on a store.
2. **The deployment URL leaves the phone** — committed, pasted into an issue,
   or visible in a screenshot or a screen recording.
3. **The schema grows** to carry anything the owner would mind losing or
   having read: location, VIN, anything identifying a person.
4. **A second user appears**, which is the point at which "one user by
   construction" stops being true.

## Consequences

- No Better Auth peer is installed, and the two optional peers stay absent.
- The sync path ships as built: `convex/sync.ts` upserts by the device's own
  id, and idempotency was proven against the live deployment rather than
  asserted.
- Should this be reopened, path 3 of the better-convex documentation adds
  Better Auth over the same schema; nothing here is written in a way that
  would have to be undone.
