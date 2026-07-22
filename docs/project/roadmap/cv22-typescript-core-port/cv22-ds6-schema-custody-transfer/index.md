[< CV22 TypeScript Core Port](../index.md)

# CV22.DS6 — Schema Custody Transfer

**Delivery Story:** Move all database creation, migration, and discipline from the Python core to the TypeScript core over the shared seam — bootstrap DDL, the migration engine and `_migrations` bookkeeping, cross-process bootstrap locking, and connection pragma discipline — with compatibility proven over **real legacy databases**, so the Python core can eventually be deleted without any user's `memory.db` breaking.
**Status:** 🟡 Planned
**Type:** Delivery Story
**Depends on:** [CV22.DS2 TS Foundation & Read-Only Command Parity](../cv22-ds2-ts-foundation-read-only-parity/index.md) (done) for the `node:sqlite` driver seam and `schemaState.ts`; [CV22.DS4 Deterministic Writes](../cv22-ds4-deterministic-writes/index.md) (done) for the backup-gated live-write discipline; the [database-seam strangler decision](../../../decisions.md) and the RS003 database audit (CR019 schema custody, CR023 `identity.metadata` contract).

---

## What This Is

Through DS5 the strangler has ported *commands* — reads, writes, external-API
surfaces — but it has never owned the **database itself**. Everything that
creates, migrates, and disciplines `memory.db` still lives only in Python:

- **Schema bootstrap** — the DDL that builds a fresh database (tables, indexes,
  triggers, the `memories_fts` FTS5 virtual table and its tokenizer config).
- **Migration engine** — the runner that upgrades an existing database forward,
  plus the `_migrations` ledger that records which migrations have run.
- **Cross-process bootstrap locking** — the `fcntl` lock that stops two
  processes from bootstrapping or migrating the same file at once.
- **Connection pragma discipline** — WAL mode, busy-timeout, and foreign-key
  enforcement applied on every connection (`src/memory/db/connection.py`).

This is the **deletion gate**. As long as any of it lives in Python, the Python
core cannot be removed — a TS-only install would have no way to create or
upgrade a database. DS6 transfers custody of all of it to TS, so DS7–DS10 can
burn down the remaining commands and ultimately delete Python against a core
that fully owns its own storage.

The seam stays the shared SQLite file and the schema/FTS5 compatibility contract
stays frozen in *meaning* — but for the first time TS is the authority that
*produces* that schema, not just a reader/writer that inherits it. DS2 recorded
a deliberate stopgap for exactly this handover:
[when the database file does not exist, the TS front door delegates to Python to
bootstrap it](../../../decisions.md). DS6 is where that delegation ends and TS
bootstraps on its own.

`ts/src/db/schemaState.ts` already holds the seam closed during the transition;
its `KNOWN_MIGRATION_IDS` snapshot is the **handover manifest** — the exact set
of migrations the TS engine must reproduce and continue.

---

## Validation Approach (custody differs from parity)

DS2–DS5 graded *observable command output* against the Python oracle. DS6 grades
the **database artifact and its lifecycle**, and the highest-value evidence is
not synthetic — it is **real legacy databases** at many historical migration
states:

- **Fresh-bootstrap equivalence.** A database created by the TS bootstrap is
  schema-identical to one created by Python — same tables, columns, indexes,
  triggers, and identical `memories_fts` FTS5 declaration/tokenizer — asserted
  structurally (schema introspection), not by eyeballing.
- **Migration equivalence over real legacy copies.** Take **copies** of real
  databases pinned at older migration states, run the TS engine forward, and
  assert the end schema and the `_migrations` ledger rows match what Python
  produces from the same seed — same order, same recorded ids.
- **Idempotency and concurrency.** Re-running bootstrap/migration is a no-op;
  two concurrent processes cannot corrupt or double-apply under the ported lock.
- **Pragma discipline.** WAL, busy-timeout, and FK enforcement are asserted
  present on TS connections.

Discipline carried from DS4: custody work runs against **copies** of real
databases, never the live file, and a backup precedes any destructive proof.
Redacted-by-default evidence (labels, counts, hashes, pass/fail) remains the
norm; real database artifacts are never committed.

---

## Candidate Stories

Codes and titles below are the planned expansion; child folders and links are
created on pull/expand. Risk-first: own fresh creation, then forward migration
over real legacy data, then the concurrency/pragma discipline that guards both —
and only then exercise the newly TS-owned schema authority with the two pending
schema decisions.

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV22.DS6.TS1](cv22-ds6-ts1-schema-bootstrap-ddl-ownership-in-ts/index.md) | Schema Bootstrap & DDL Ownership in TS | Technical Story | The fresh-database DDL (rewritten in English per CV0) lives in TS behind the driver seam, proven structurally identical (incl. CHECK constraints and partial-index predicates) to a real fresh Python database via a committed cross-language snapshot; the front-door delegation flip is deferred to TS2/TS3 (needs `_migrations` seeding + locking/pragmas first) | ✅ Done |
| [CV22.DS6.TS2](cv22-ds6-ts2-migration-engine-migrations-bookkeeping-in-ts/index.md) | Migration Engine & `_migrations` Bookkeeping in TS | Technical Story | The migration runner and `_migrations` ledger are ported; `KNOWN_MIGRATION_IDS` becomes the enforced manifest; forward migration over **real legacy DB copies** (a cascading fixture generator, 8 checkpoints) yields the same end schema, ledger rows, and row-level values as Python | ✅ Done† |
| [CV22.DS6.TS3](cv22-ds6-ts3-cross-process-locking-connection-pragma-discipline/index.md) | Cross-Process Locking & Connection Pragma Discipline | Technical Story | `fcntl`-equivalent bootstrap/migration locking and WAL/busy-timeout/FK pragma discipline are owned by the TS connection module (`ts/src/db/bootstrap.ts`, `bootstrapLock.ts`); concurrent-bootstrap safety proven with 8 real child processes racing the same fresh path, and pragma presence (WAL/busy_timeout/foreign_keys) proven against the Python oracle in CI | ✅ Done‡ |
| [CV22.DS6.TS4](cv22-ds6-ts4-front-door-bootstrap-flip/index.md) | Front-Door Bootstrap Flip — TS Owns First-Run Database Creation | Technical Story | The DS2/DS3 "delegate a missing database to Python" front-door stopgap is removed; a missing `memory.db` is bootstrapped through the TS core (`bootstrapDatabaseIfMissing` → `bootstrapDatabase`) under the cross-process lock, proven hermetically (first-run self-heal with `uv` unreachable) for both read and write routes | ✅ Done |
| [CV22.DS6.US1](cv22-ds6-us1-identity-metadata-canonicalization/index.md) | `identity.metadata` Canonicalization | User Story | Retired the `pyJson.ts` byte-mimicry: journey metadata now serialized as canonical `JSON.stringify` with a read-tolerant policy (no data migration — old rows converge on next write, US2 mops up residuals); write-parity grades this column semantically (per CR023) | ✅ Done |
| CV22.DS6.US2 | `parent_journey` First-Class Column | User Story | Graduate `parent_journey` from JSON metadata to an indexed column with real referential integrity — a genuine schema migration that exercises the new TS migration engine end-to-end | 🟡 Planned |

Suggested sequence: **TS1** (fresh bootstrap) → **TS2** (forward migration over
real legacy copies) → **TS3** (locking + pragmas that guard both) → **TS4**
(flip the front door to TS-owned first-run bootstrap) → **US1** / **US2** (the
two custody-gated schema decisions, which also serve as the first real proof
that the TS migration engine can author new schema).

† **Carried debt from TS2 (deferred, tracked — not silently absorbed):**
migration `016` (`builder_workbench_display_codes`) has no legacy-transition
fixture; only its fresh-DB (already-modern-shape) behavior is proven, not the
real `ADD COLUMN`/backfill-against-`NULL`-rows logic. **Revisit before DS6
itself is marked Done** — DS6's own Done Condition below requires
compatibility proven over real legacy database copies at multiple historical
migration states, which is not yet true for `016`. See
[CV22.DS6.TS2's Review](cv22-ds6-ts2-migration-engine-migrations-bookkeeping-in-ts/review.md)
for the full debt record.

‡ **Carried debt from TS3 — RESOLVED by [CV22.DS6.TS4](cv22-ds6-ts4-front-door-bootstrap-flip/index.md):**
the DS2/DS3 "delegate to Python to bootstrap a missing database" front-door
stopgap was deliberately not flipped in TS3 (kept as a separately-scoped
follow-up rather than riding in on the lock/pragma capability). TS4 flipped it:
the three front-door self-heal sites in `ts/src/frontDoor/cli.ts` now bootstrap a
missing database through the TS core (`bootstrapDatabaseIfMissing`), proven
hermetically for read and write routes, and `firstRun.test.ts` was rewritten
from Python-self-heal to TS-self-heal. The DS6 Done-Condition requirement to
remove the DS2 bootstrap delegation is now met. See
[CV22.DS6.TS3's Review](cv22-ds6-ts3-cross-process-locking-connection-pragma-discipline/review.md)
for the original debt record.

---

## Done Condition

- Database **creation, migration, `_migrations` bookkeeping, cross-process
  locking, and pragma discipline** are answered by the TS core; the DS2
  new-database-bootstrap delegation to Python is removed.
- Compatibility is proven over **real legacy database copies** at multiple
  historical migration states — same end schema, same `memories_fts`
  declaration, same `_migrations` ledger — under a **backup gate**, never
  against the live database.
- The schema/FTS5 compatibility contract holds; existing `memory.db` files keep
  working with no user-visible change and no data loss.
- The two custody-gated schema decisions are resolved and applied through the TS
  engine: `identity.metadata` canonicalization (CR023) and `parent_journey` as a
  first-class indexed column.
- `KNOWN_MIGRATION_IDS` reflects the TS-owned migration set and is the single
  source of truth the runtime enforces.
- Mutation safety stays explicit: custody proofs run on copies, backup-gated,
  redacted by default; no real database artifact is committed.

---

## Non-Goals

- No remaining command burn-down (Builder/Ariad, Soul, Explorer, mirror-mode,
  extraction lifecycle) — that is CV22.DS7.
- No live-provider cutover — CV22.DS8.
- No MCP server — CV22.DS9.
- No Python deletion, package rename, or npm distribution — CV22.DS10.
- No semantic or behavioral change to search/extraction/memory — this is custody
  transfer, not redesign. New schema shape (`parent_journey`) is a structural
  change with a migration, not a change to what the data *means*.
- No schema change beyond the two decisions explicitly gated on custody by the
  RS003 audit.

---

## See also

- [CV22 index](../index.md)
- [CV22 Collaboration Strategy — Later baton: CV22.DS6](../collaboration-strategy.md)
- [Decisions — database-seam strangler](../../../decisions.md)
- [Decisions — `identity.metadata` contract: canonicalize at DS6 (CR023)](../../../decisions.md)
- [Decisions — new-database bootstrap delegates to Python until DS6 custody transfer](../../../decisions.md)
- [CV22.DS2 TS Foundation & Read-Only Command Parity](../cv22-ds2-ts-foundation-read-only-parity/index.md)
- [CV22.DS4 Deterministic Writes](../cv22-ds4-deterministic-writes/index.md)
