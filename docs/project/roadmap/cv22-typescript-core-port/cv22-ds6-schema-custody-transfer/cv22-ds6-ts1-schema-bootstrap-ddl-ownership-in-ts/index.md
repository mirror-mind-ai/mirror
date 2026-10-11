[< Parent](../index.md)

# CV22.DS6.TS1 — Schema Bootstrap & DDL Ownership in TS

**Status:** ✅ Done
**Type:** Technical Story
**Depends on:** [CV22.DS2 TS Foundation & Read-Only Command Parity](../../cv22-ds2-ts-foundation-read-only-parity/index.md) (done) for the `node:sqlite` driver seam; the [database-seam strangler decision](../../../../decisions.md).

---

## Technical Story

DS6's first slice: own the fresh-database **schema DDL** in the TS core. Ports
Python's `SCHEMA` (`src/memory/db/schema.py`) into `ts/src/db/schema.ts`
(comments rewritten to English per CV0, identity-taxonomy enumerations
preserved verbatim), behind an idempotent `createSchema(db)`. Proves — rather
than assumes — that a TS-created fresh database is structurally identical to a
real Python-created one, including the parts no `PRAGMA` exposes (CHECK
constraints, partial-index predicates) and the parts that are easy to get
subtly wrong (FTS5 external-content wiring, column order).

The Plan's blocking premise — that `SCHEMA`-only creation must equal Python's
true `migrations`-then-`SCHEMA` fresh-DB output, not just `schema.py`'s literal
text — was tested empirically, not assumed, and it found a real divergence: see
Findings below.

## Outcome

- `ts/src/db/schema.ts` — the ported DDL + `createSchema(db)`, idempotent
  (`IF NOT EXISTS` throughout) and safe against a populated database.
- `ts/src/db/schemaInventory.ts` — an independent TS implementation of a
  canonical, cross-language schema-inventory contract (tables/columns/foreign
  keys, indexes incl. partial predicates, triggers, all via `PRAGMA`
  introspection plus comment-stripped/whitespace-normalized SQL text for the
  structure no `PRAGMA` exposes); excludes FTS5-internal shadow tables
  (a SQLite-library-version implementation detail, not a DDL contract) and the
  `_migrations` table (CV22.DS6.TS2 scope).
- `ts/src/db/schemaInventorySnapshot.ts` — the committed cross-language oracle,
  generated from a real fresh Python database.
- `src/memory/db/schema_inventory.py` — the Python counterpart builder, plus
  `tests/unit/memory/db/test_schema_inventory_snapshot.py`, the drift guard
  that fails the build if the committed snapshot goes stale (mirrors
  `KNOWN_MIGRATION_IDS`/`test_ts_schema_contract.py`).
  `uv run python -m memory.db.schema_inventory` regenerates it.
- `ts/parity/schema_structural_parity.ts` — the Navigator-visible route:
  builds a fresh TS database, diffs its inventory against the committed
  snapshot (pinpointing any diverging table/index/trigger by name), runs an
  FTS5 functional probe including accented content, and prints one
  `STRUCTURAL PARITY: PASS/FAIL` line with a matching exit code.

## Findings (from empirically testing the Plan's blocking premise)

- **`tasks` column order genuinely diverges** between `schema.py`'s literal
  text and Python's true fresh-DB output: migration `004_tasks_temporal_fields`
  `ALTER TABLE ADD COLUMN`s `scheduled_at`/`time_hint` onto the table migration
  `003_create_tasks` already built, so they land at the *end* in every real
  install — `schema.py`'s `CREATE TABLE IF NOT EXISTS` never actually fires for
  `tasks` in practice. `schema.ts` reproduces the true order, documented inline;
  the `schema.py` staleness itself is recorded as reviewed debt (`no_action` —
  dormant, harmless, Python frozen).
- A related artifact: SQLite's `ALTER TABLE ADD COLUMN` textually splices the
  new column definition into the stored `CREATE TABLE` text with uneven
  spacing. `normalize_sql`/`normalizeSql` (kept in lockstep across both
  languages) now also strips whitespace immediately before `,`/`)`.

## Acceptance Behavior

```text
Given a fresh SQLite database created by the TS core's createSchema()
When its schema objects are compared to the committed Python fresh-schema snapshot
Then tables, columns, types, defaults, PKs, FKs, indexes (incl. partial predicates),
     CHECK constraints, FTS5 config, and triggers are identical (symmetric diff)
And SCHEMA-only creation equals Python's migrations-then-SCHEMA result (no deltas)
And an insert/update/delete on `memories` — including a diacritic term — is
     correctly reflected through `memories_fts`
And createSchema is idempotent (run twice: no error, no duplicate objects)
And createSchema against a populated DB leaves all existing data untouched
And no existing database is modified and no routing behavior changes
```

Proven by 20 tests (`ts/test/db/schema.test.ts` + `schemaInventory.test.ts`),
20 Python tests (`test_schema_inventory.py` + `test_schema_inventory_snapshot.py`),
and the Navigator-run parity script — all green.

## Scope

- Port the DDL to `ts/src/db/schema.ts`; idempotent `createSchema(db)`.
- Prove structural parity (tables, columns, FKs, indexes incl. partial
  predicates, CHECK constraints, FTS5 config, triggers) against a committed
  Python snapshot.

## Out Of Scope

- **`_migrations` bookkeeping / baseline stamping** — CV22.DS6.TS2.
- **Front-door new-DB delegation flip** — deferred until the full bootstrap
  trio (schema + migrations + locking/pragmas) exists in TS — CV22.DS6.TS2/TS3.
- Cross-process bootstrap locking, connection pragma discipline, and the
  owner-only (`0o700`/`0o600`) data-at-rest posture — CV22.DS6.TS3.
- Any schema *change* — `identity.metadata` canonicalization (US1),
  `parent_journey` first-class column (US2).
- No behavior or semantic change; no migration of existing databases.

## Validation

- **Automated (CI-safe, data-free, release-blocking):** 20 TS tests + 20 Python
  tests, hermetic (the committed snapshot is the oracle — no live Python call
  needed at Node-test runtime).
- **Navigator-run:** `node ts/parity/schema_structural_parity.ts` —
  `STRUCTURAL PARITY: PASS`, tables 22/indexes 54/triggers 3 all matching, FTS
  probe green. Navigator-validated and accepted.
- **E2E:** not required — schema creation is deterministic and data-free; the
  Plan's narrower structural-parity + FTS-probe route was Navigator-approved.
- Reviewed by a six-persona panel (engineer, database-architect, devops,
  ai-engineer, security, prompt-engineer) at Plan time; every condition folded
  into the plan before implementation began.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Review](review.md)
- [Done](done.md)
