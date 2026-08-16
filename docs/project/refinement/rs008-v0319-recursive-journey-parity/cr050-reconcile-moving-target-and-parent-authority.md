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

Approved by the Navigator. Implementation remains a separate authorization gate.

### Decision recommendation

1. Adopt the released moving-target strangler rule on the migration branch: Python may
   evolve while it remains runtime authority for an unported entry point; each change
   creates named TS parity scope. Once authority transfers for an entry point, new
   behavior lands in TS and Python becomes compatibility-only for that entry point.
2. Keep migration `017_journey_parent_column` because it has already been authored and
   exercised on the migration branch, but classify the column as a derived/indexable
   projection during mixed-engine operation, not as the sole semantic authority.
3. Resolve effective parent **metadata-first while any Python parent writer remains**.
   Every current Python path writes metadata; TS parent-capable writes already write
   metadata and the column atomically. Metadata-first therefore observes both engines,
   while column-first can return a stale value after the released Python web path moves
   a journey.
4. Use the first-class column only as fallback when metadata has no usable
   `parent_journey`, preserving migrated or column-only rows without overriding a newer
   metadata value.
5. Require every TS parent mutation to dual-write metadata and the column in one
   transaction. Non-parent metadata writes must preserve both representations and must
   not silently resynchronize a known conflict.
6. Defer any future column-authority flip until all parent writers and affected web/API
   entry points have transferred to TS and a separate decision proves that no mixed
   writer can leave the column stale.

### Implementation route

1. **Update policy documents.** Replace the strict Python freeze in the CV22 roadmap,
   decisions, and engineering guidance with the moving-target/command-authority rule
   already released on main. Preserve the database seam, copy-only write parity,
   backup gates, and command-by-command retirement.
2. **Name the representation contract.** Amend the migration `017`, DS6.US2/US3, and
   DS7.US1 narratives so they distinguish semantic metadata authority from the
   derived first-class projection during the mixed-engine interval. Record that
   `v0.31.9` required no Python schema migration.
3. **Change the shared resolver.** Make `resolveParentJourney` metadata-first with
   column fallback and ensure journey listing, validation, status, selectors, and all
   other TS readers use that single resolver.
4. **Inventory writers.** Characterize every Python and TS path that can create or move
   a parent relation, including the Python Workspace/web metadata update and TS create
   or future move routes. Document which engine currently owns each entry point.
5. **Preserve atomic TS writes.** Keep or extend the existing transaction that writes
   metadata and `identity.parent_journey` together. Add conflict-state tests proving a
   stale non-null column cannot override newer metadata during mixed operation.
6. **Rebaseline parity evidence.** Update synthetic goldens, real-DB-copy probes,
   schema-divergence documentation, and the oracle-drift baseline only after the
   authority rule is fixed. Do not use production data.
7. **Review downstream scope.** Recheck CR051–CR054 and the CV22 command burn-down
   denominator against the reconciled authority map before declaring CR050 validated.

### Affected surfaces

- `docs/project/decisions.md`
- `docs/process/engineering-principles.md`
- `docs/project/roadmap/cv22-typescript-core-port/**`
- `ts/src/journey/parentJourney.ts`
- journey listing, validation, and writer call sites using the shared resolver
- TS journey and parity tests/goldens
- migration `017` compatibility and schema-divergence documentation

### Acceptance criteria

- CV22 contains no active statement that Python is globally frozen while main declares
  a moving target.
- One documented authority table names every current Python and TS journey-parent
  reader/writer and its transfer state.
- With metadata parent `new-parent` and stale column `old-parent`, every TS journey read
  and validator resolves `new-parent` during mixed-engine operation.
- With no usable metadata parent and a populated column, TS preserves the column value
  as compatibility fallback.
- TS parent writes update metadata and column atomically; injected mid-write failure
  leaves neither side partially changed.
- Python can open and operate on a database carrying migration `017` without requiring
  a Python migration or changing `v0.31.9` semantics.
- Schema, synthetic, and real-copy parity checks pass without inspecting or mutating a
  live personal database.
- CR051–CR054 remain explicit open obligations; CR050 does not silently implement or
  close them.

### Validation route

1. Focused TS unit tests for resolver precedence, malformed metadata, column fallback,
   stale conflict, and atomic rollback.
2. Existing TS typecheck, Biome, and full `node:test` suite.
3. Python journey and schema compatibility tests through `uv run`, with no Python
   behavior redesign inside this CR.
4. Structural schema parity and migration-fixture checks over isolated copies.
5. A portable mixed-writer smoke: seed one copied database, perform a Python metadata
   parent move, read through TS, and prove the new parent wins while the original DB is
   untouched.
6. Documentation links, duplicate roadmap headings, and `git diff --check`.

### Conscious exclusions

- Recursive read/render implementation (CR051).
- Arbitrary-depth validation and movement implementation (CR052).
- Journey removal (CR053).
- Workspace/web backend transfer (CR054).
- Removing migration `017`, adding another schema migration, or making filesystem
  changes.
- Automatic repair of existing metadata/column conflicts.
- Commit, push, merge, publication, or release without their own authorization.

### Stop conditions

Stop and return to the Navigator if the implementation requires removing an applied
migration, changing the released Python schema, choosing a different parent authority,
automatically rewriting conflicting user rows, or broadening into CR051–CR054.

## Evidence

- `docs/project/roadmap/cv22-typescript-core-port/index.md` still says Python is frozen.
- `ts/src/db/migrations.ts` authors migration `017_journey_parent_column`.
- `ts/src/journey/journeyOptions.ts` documents column-first authority.
- `v0.31.9` shipped arbitrary-depth parentage without a schema migration.

No SQLite Workbench state was inspected while capturing this CR.

## Outcome

Captured. No policy, schema, routing, code, assignment, or focus changed.
