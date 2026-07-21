[< Story](index.md)

# Test Guide — CV22.DS6.TS1

## Oracle: committed snapshot (not a live Python call)

CI runs a separate Node job (no `uv`/Python) and an unchanged Python job, so the
Node test must not shell `uv run python`. Mirror the `KNOWN_MIGRATION_IDS`
pattern:

1. A Python generator emits a **canonical fresh-schema inventory (JSON)** from a
   fresh Python DB (`run_migrations` then `SCHEMA`); it is **committed**.
2. A **Python drift-guard test** regenerates and asserts equality — a Python
   schema change must update the committed snapshot in the same commit.
3. The **hermetic Node test** creates a fresh DB via `createSchema()`, computes
   the same canonical inventory, and asserts equality with the snapshot.

The inventory canonicalization is a shared contract: same normalization on both
sides (sorted objects, whitespace-normalized trigger/CHECK text).

## Automated Validation (CI, data-free, release-blocking)

- **Structural inventory diff (symmetric)** — fail if either side has an extra
  object. Covers:
  - `sqlite_master` objects (tables, indexes, triggers) by name + type;
  - `PRAGMA table_info` per table (name, type, `NOT NULL`, default, PK);
  - `PRAGMA index_list` / `index_info` (uniqueness);
  - **CHECK constraints + partial-index predicates** via normalized
    `sqlite_master.sql` on the comment-free carriers
    (`builder_refinement_stories`, `builder_change_requests`,
    `exploratory_stories`, `idx_exploratory_stories_one_active_per_journey`);
  - `PRAGMA foreign_key_list` (FK edges);
  - `memories_fts` FTS5 declaration + default `unicode61` tokenizer;
  - the three FTS trigger bodies (whitespace-normalized).
  - `_migrations` is **excluded** (owned by TS2).
- **`SCHEMA` ≡ migrated-fresh (blocking)** — because the snapshot is generated
  from migrations-then-`SCHEMA` and the TS side is `SCHEMA`-only, any delta fails
  the build.
- **FTS functional probe** — insert a `memories` row (including a **diacritic /
  non-ASCII** term) → assert found via `memories_fts`; update → assert new text
  matches, old does not; delete → assert gone.
- **Idempotency** — run `createSchema` twice → no error, no duplicate objects.
- **Populated-DB no-op** — run against a DB with existing rows → data untouched,
  no error.
- Per-test temp files with cleanup; readable structural diff on failure (never a
  bare "not equal"). This test is a release gate, same tier as the DS2 golden.

## E2E Decision

**Fixture/temp-DB structural parity is sufficient** — schema creation is
deterministic and data-free; no runtime end-to-end is warranted. Pending
explicit Navigator acceptance of this narrower route.

## Navigator Validation

Run the parity script (builds a fresh TS DB; compares to the committed snapshot;
prints schema-only inventory):

- **Expected observation:** `STRUCTURAL PARITY: PASS`, identical inventories,
  FTS probe green.
- **Pass condition:** zero structural deltas **and** FTS probe green.
- **Fail condition:** any table/column/index/constraint/trigger/FTS delta, or
  FTS probe red.

## Validation Evidence

Pending implementation and validation.
