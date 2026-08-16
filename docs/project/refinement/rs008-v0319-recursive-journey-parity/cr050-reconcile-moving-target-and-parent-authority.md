[< RS008](index.md) · [Canonical status](../index.md#change-requests)

# CR050 — Reconcile Moving-Target Policy And Parent Authority

## Problem

The released project decision allows Python to evolve while it remains authority for an
unported command and requires every change to become explicit TypeScript parity scope.
The `mirror-ts-core` roadmap still describes a frozen, maintenance-only Python engine.
At the same time, the TS branch authors migration `017_journey_parent_column` and has
moved from JSON-first shadow reads toward column-first authority, while `v0.31.9`
released arbitrary-depth parentage through existing journey metadata without a schema
migration.

These two disagreements make it unclear which behavior is the oracle, which parent
representation is authoritative during transition, and what must converge before a
journey command can truthfully be called ported.

## Expected Behavior

CV22 documents one current authority contract consistent with the released
moving-target strangler decision. It explicitly states how metadata JSON and the TS-only
first-class parent column coexist with Python `v0.31.9` writes, including stale-column
handling, backfill, dual-read/dual-write boundaries, migration compatibility, and the
point at which authority may transfer.

No command is declared at parity while its observable behavior or effective parent can
differ by engine.

## Impact

Without reconciliation, green branch-local tests can validate an obsolete oracle, and
Python and TS may resolve different parents for the same database row. Continuing the
command burn-down on that basis risks silent hierarchy corruption and false retirement
claims.

## Plan Or Decision

Not planned. Planning should compare the published `v0.31.9` contract, current main
roadmap decisions, migration `017`, `resolveParentJourney`, every Python and TS parent
writer, and front-door routing. It must select one transition-safe authority rule and
name the required compatibility evidence before implementation.

## Evidence

- `docs/project/roadmap/cv22-typescript-core-port/index.md` still says Python is frozen.
- `ts/src/db/migrations.ts` authors migration `017_journey_parent_column`.
- `ts/src/journey/journeyOptions.ts` documents column-first authority.
- `v0.31.9` shipped arbitrary-depth parentage without a schema migration.

No SQLite Workbench state was inspected while capturing this CR.

## Outcome

Captured. No policy, schema, routing, code, assignment, or focus changed.
