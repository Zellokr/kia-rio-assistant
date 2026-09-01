# ADR-014: Fase 4 opened on its local half, with Convex integration gated on a deployment

**Status**: Accepted
**Date**: 2026-09-01
**Decided by**: Kristian (project owner)
**Related**: [ADR-013](ADR-013-fase-3-closure.md), [ADR-010](ADR-010-fase-3-opening.md), [ADR-004](ADR-004-part-a-closure.md), `docs/PHASE_ROADMAP.md`, spec §3, §3.1, §7 RNF-001, §8.1, §9.5, §15.1, §15.2, §16, RF-034, RF-035, RF-036, RF-037, R-09, T-009, T-011

## Decision

Fase 4 (**Convex and maintenance**) is open as of 2026-09-01, and it starts on
the half that needs **no Convex account**: finishing local persistence
(RF-034), maintenance records (RF-036) and the durable sync queue behind an
encapsulated port. Convex integration proper (RF-035's remote half) is gated
on a deployment the owner has to make.

This is the same shape ADR-013 found in Fase 3 and for the same reason: the
spec puts the secret-holding component in a backend, so the client half can be
built and tested locally while the deployment stays a separate, owner-owned
step.

## §3.1 was checked, not assumed

> No se iniciará una fase mientras la anterior no tenga pruebas reproducibles
> y un criterio de salida verificado. En particular, Nuxt, Convex, voz e IA no
> deben utilizarse para ocultar una conexión OBD inestable.

Fase 3 has **reproducible tests** — 88 files, 884 tests, plus lint, typecheck
and a native Android build in CI. Its **exit criterion is verified**, with six
gaps that [ADR-013](ADR-013-fase-3-closure.md) names rather than waives. Both
conditions hold, so the transition is legal.

The second sentence names Convex explicitly, so it deserves a direct answer
rather than a citation. The OBD connection is still the best-evidenced part of
this stack — eleven consecutive connections, 7.7–10.4 s to ready, no drift —
and the one open failure path, ADR-004's post-fix Bluetooth-toggle recovery,
is understood, fixed and covered by tests. Fase 4's first work items are local
persistence and a queue. Neither can hide a connection failure; a queue that
holds operations through a drop makes one *more* visible, not less.

## A MUST this repository had never written down: RNF-001

Reading §7 for this ADR surfaced something the mirror had missed.

> **RNF-001 — Fiabilidad (MUST).** *"Una sesión de 60 minutos al ralentí no
> debe bloquearse ni solapar comandos."*

`RNF-001` appears in **no tracked document in this repository**. The Sprint 0
table mirrors Anexo B's *"diez conexiones y una sesión de 30 minutos"* and
stops there, so the project has been tracking the 30-minute gate and has never
recorded that §7 and §15.2 both ask for **60**. The longest real session run
against the car was **ten minutes**, deliberately shortened, with the
arithmetic written down in `docs/FIELD_TEST_VEHICLE_VALIDATION.md`.

So there are three numbers, and the repository knew about one of them:

| Source | Duration | Status |
|---|---|---|
| Anexo B, Sprint 0 task 8 | 30 minutes | Shortened to 10 by owner waiver (ADR-004) |
| §7 RNF-001 (MUST) | 60 minutes at idle | **Never run, never mirrored until now** |
| §15.2 MVP acceptance | 60 minutes without overlapping commands | **Not met** |

**This does not block opening Fase 4**, because §3.1 gates a phase on the
*previous phase's* exit criterion, and Fase 3's is verified. It does block
something else, and this ADR records it so nobody discovers it later: **§15.2's
MVP acceptance cannot be claimed** while RNF-001 is unrun, no matter how much
of Fase 4 ships. It is a vehicle gate, not a code gate.

## What Fase 4 actually requires

Exit criterion (§3): *"Sincronización obligatoria, historial, registros de
mantenimiento, recordatorios, recuperación de cola y exportación básica."*
Definition of done (§15.3): *"Sincronización y mantenimiento sin comprometer
la operación local."*

| ID | Requirement | Priority | State |
|---|---|---|---|
| RF-034 | Persist sessions, DTCs, **evaluations** and **maintenance** in IndexedDB | MUST | **Half built.** `data/indexeddb/` holds four stores at DB v1 — sessions, events, DTC observations, PID cache — with a migration framework. Evaluations and maintenance have no store. |
| RF-035 | Sync changes with Convex through a mandatory fault-tolerant queue | MUST | **Not started.** No `convex/`, no `server/`, no queue. |
| RF-036 | Maintenance by date and user-entered mileage, showing upcoming due dates without the ECU | SHOULD | Not started. |
| RF-037 | Export a session report for a workshop, separating facts, interpretation and limitations | COULD | Not started as a report; a raw log export exists in the UI. |

Three constraints shape the work before any code is written:

- **§8.1** makes IndexedDB the primary client source and Convex the backend
  for synced history, maintenance, shared config and secure AI execution.
  Convex *"no recibe muestras de alta frecuencia sin agregación"*, every
  record carries `schemaVersion`, and the user must be able to delete a
  session, a vehicle or everything — **locally and remotely**.
- **R-09** rates the community Nuxt-Convex integration a medium risk and
  prescribes the mitigation: *"Encapsular el cliente de sincronización y
  evitar acoplar el núcleo OBD."* The queue therefore talks to a port this
  repository owns, exactly as `ObdTransport` and `SpeechSynthesisPort` do.
- **T-009 and T-011** are the acceptance tests that matter most: with no
  Internet, telemetry, DTC, rules and local history keep working; with Convex
  down, *"la operación queda en cola sin perder datos"*.

## Why the local half goes first

It is the only ordering that is honest about what is provable today.

A durable queue with retry and no duplication (T-011) can be built and tested
against a fake remote port with no account, and it is where the interesting
failures live. Assessments and maintenance stores (RF-034, RF-036) are pure
local persistence and a DB v2 migration. None of it needs a Convex instance,
and none of it is throwaway once one exists.

The remote half needs an owner action that §15.1's own Sprint 0 checklist
lists and that was never done: *"Instancia de Convex creada, variables de
entorno configuradas y esquema inicial desplegado."* Building a sync client
against a backend nobody has deployed would produce exactly the kind of
evidence this project has already learned to distrust — code that passes
against an injected fake and has never met the real thing, which is what
`WebSerialRfcommTransport` was before it was deleted and what the Web Speech
TTS was before the phone answered.

## What this opening does NOT claim

1. **§9.5 is not satisfied and is not close.** *"La versión funcional completa
   no se considerará terminada sin integración operativa de IA y Convex"*, and
   the spec adds that degraded mode *"es una medida de resiliencia, no una
   variante del producto sin backend ni IA"*. This project currently has
   neither an AI provider nor a Convex instance deployed. That is a real
   distance from the spec's finished product, and closing Fase 3 as an MVP
   (ADR-013) did not shorten it.
2. **RNF-001 stays unrun**, and with it §15.2's MVP acceptance.
3. **ADR-004's A2 waiver stays open**, carried now for the third phase in a
   row.
4. The five other gaps ADR-013 named are unchanged.

## How we would know this was the wrong call

If the queue port has to be reshaped once a real Convex instance exists — its
transaction boundaries, its idempotency keys, its conflict handling — then
building it before the deployment bought less than it appeared to, and the
right order was to deploy first and design against the real client.

The other way this turns out wrong is scope. Fase 4 is the phase where a local
diagnostic tool acquires a backend, an account and a schema to migrate. If the
local half starts pulling in Convex-shaped abstractions before an instance
exists, R-09's warning about coupling has been ignored rather than followed.

## Consequences

- Fase 4 is open. Work starts on RF-034's missing stores, RF-036 and the
  durable queue behind an owned port.
- **RNF-001 is now mirrored** into `docs/PHASE_ROADMAP.md` as an open caveat.
  It is a vehicle gate and nothing in Fase 4 can close it.
- Deploying a Convex instance is an owner action, tracked as the gate on
  RF-035's remote half. It is not a Fase 4 code task.
- The OBD core stays read-only and stays uncoupled from sync, per R-09.
