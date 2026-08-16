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
3. Resolve effective parent from **metadata only while any Python parent writer
   remains**. Every supported Python path writes metadata; TS parent-capable writes
   already write metadata and the column atomically. Metadata-only therefore observes
   both engines, while any column fallback can resurrect a stale parent after the
   released Python web path removes `parent_journey` from metadata.
4. Keep the first-class column as a derived/indexable projection only. A column value
   without matching metadata is drift to diagnose, never silent semantic fallback.
   Migration `017` backfills without removing JSON, and supported TS writers dual-write,
   so no supported path requires a column-only semantic row.
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
3. **Change the shared resolver.** Make `resolveParentJourney` metadata-only during
   mixed-engine operation and ensure journey listing, validation, status, selectors,
   and all other TS readers use that single resolver. Column/metadata disagreement is
   exposed by diagnostics or parity evidence rather than repaired during a read.
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
- With metadata that omits `parent_journey` and a stale populated column, TS resolves
  the journey as a root; it never resurrects the column value.
- With absent, malformed, or non-object metadata and a populated column, TS matches the
  tolerant Python reader and resolves no parent rather than inventing column authority.
- TS parent writes update metadata and column atomically; injected mid-write failure
  leaves neither side partially changed.
- Python can open and operate on a database carrying migration `017` without requiring
  a Python migration or changing `v0.31.9` semantics.
- Schema, synthetic, and real-copy parity checks pass without inspecting or mutating a
  live personal database.
- CR051–CR054 remain explicit open obligations; CR050 does not silently implement or
  close them.

### Validation route

1. Focused TS unit tests for metadata precedence, parent removal, malformed metadata,
   stale column conflicts, and atomic rollback.
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

### Approved amendment

During TDD, the Navigator approved strengthening the transition rule from
metadata-first-with-column-fallback to **metadata-only semantic authority**. Python
unparenting removes the metadata key but cannot clear migration `017`'s column; fallback
would therefore resurrect an old parent. The column remains a projection until every
parent writer transfers and a later explicit decision changes authority.

## Evidence

- `docs/project/roadmap/cv22-typescript-core-port/index.md` still says Python is frozen.
- `ts/src/db/migrations.ts` authors migration `017_journey_parent_column`.
- `ts/src/journey/journeyOptions.ts` documents column-first authority.
- `v0.31.9` shipped arbitrary-depth parentage without a schema migration.

### Parent authority map

| Entry point or component | Engine | Current role | Parent representation | Transfer state |
|--------------------------|--------|--------------|-----------------------|----------------|
| `JourneyService.create_journey` | Python | Creates journeys for Python/web routes | metadata | Python authority where still routed |
| `JourneyService.update_metadata_fields` | Python | Moves or unparents journeys from Workspace/web | metadata; removal deletes the key | Python authority, unported |
| `JourneyService.list_journey_options` and validator | Python | Released `v0.31.9` read/decision oracle | metadata | Oracle for CR051/CR052 |
| migration `017_journey_parent_column` | TS | Backfills/indexes parent projection | column derived from metadata | Applied; not semantic authority |
| `createJourney` | TS | Ported parent-capable writer | atomic metadata + column | TS authority only where routed |
| `setProjectPath` and non-parent TS metadata writes | TS | Preserve unrelated journey metadata | metadata; parent projection untouched | Ported, no parent mutation |
| `resolveParentJourney` consumers | TS | Journey listing read seam; future parent validators must share it | metadata only under CR050 | Transition rule implemented; recursive validation remains CR052 |
| Workspace/web hierarchy API | Python + JS | Released navigation and parent mutation surface | Python metadata read/write | Explicitly unported; CR054 owns transfer |

No supported writer produces a legitimate column-only parent. A mismatch means a stale
projection or external/manual drift and must not silently change tree semantics.

No SQLite Workbench state was inspected while capturing or implementing this CR.

### Implementation evidence

- `resolveParentJourney` now reads semantic parentage from metadata only. Migration
  `017`'s column remains present and observable but cannot override a move or unparent
  performed by Python.
- TS `createJourney` continues to dual-write metadata and the projection atomically;
  the existing injected mid-write failure test still proves complete rollback.
- TDD first reproduced three stale-column failures: divergent metadata, valid metadata
  with the parent key removed, and column-only/malformed states. All pass after the
  resolver change.
- An integration regression test performs a Python-style metadata-only move and
  unparent against a row whose TS column remains stale; both reads follow metadata.
- CV22 roadmap, project decisions, engineering principles, DS6.US2/US3, and DS7.US1
  now record the moving-target rule and mixed-engine representation contract.
- The authority map above names current readers, writers, representations, and transfer
  state. CR051–CR054 remain separate open obligations.

### Validation evidence

- Focused TS journey tests: `17` passed before the full run.
- Full TS suite: `802` passed.
- TypeScript typecheck and Biome: passed.
- Focused Python journey/schema suite: `51` passed.
- Full Python 3.12 suite: `2457` passed.
- Ruff lint and format: passed.
- Schema structural parity: passed, including the one enumerated TS-only column/index.
- Migration fixture parity: all nine probes passed (`001`, `002`, `003`, `004`, `005`,
  `008`, `009`, `016`, and multi-hop chain).
- Oracle-drift check: clean.
- Documentation links, anchors, roadmap heading uniqueness, and `git diff --check`:
  passed.
- Portable mixed-writer front-door smoke: a metadata-only move appeared under
  `new-root` despite stale column `old-root`; removing the metadata parent rendered the
  journey as a root rather than resurrecting `old-root`.

The local macOS Python 3.10.6 full run exposed two pre-existing SQLite-version-specific
failures (`WAL` sidecar recovery and direct FTS shadow-table corruption) plus one
transient operations timeout that passed immediately in isolation. No changed CR050
file participates in those tests. The supported Python 3.12 local suite is fully green;
CI remains responsible for the Linux 3.10 matrix.

Repository-wide mypy retains its pre-existing baseline of 109 errors in 26 Python
files. CR050 changes no Python source; TS typecheck is green.

## Review

The implementation is proportional: one shared resolver changed, existing atomic
writers remained intact, and active policy documents were reconciled without removing
migration `017`, adding a schema migration, repairing user rows, or absorbing recursive
hierarchy work from CR051–CR054. No new runtime subsystem, fallback, watcher, or
synchronization mechanism was introduced.

No corrective debt action is required for CR050. The intentionally deferred product
scope is already visible as CR051–CR054, not hidden implementation debt.

## Outcome

Implemented and locally validated. Canonical status remains `in_progress` pending the
commit/push gate, integrated CI, and explicit Navigator validation of the mixed-writer
behavior.
