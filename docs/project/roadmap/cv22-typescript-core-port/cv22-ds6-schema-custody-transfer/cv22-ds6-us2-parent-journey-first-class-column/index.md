[< Parent](../index.md)

# CV22.DS6.US2 — `parent_journey` First-Class Column (Schema-Authorship Core)

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

The TS migration engine authors its **first new forward migration** — `017`,
adding an indexed `identity.parent_journey` column and backfilling it from the
JSON metadata — proving TS can evolve schema Python lacks. The two seam contracts
that enforced "TS == Python" are renegotiated to "**TS ⊇ Python**" through one
enumerated divergence, and `assertSchemaState` is softened so existing
Python-migrated databases (which cannot receive a TS-only migration) are still
served rather than refused. No user-visible change: the runtime read/write path
still uses the JSON metadata.

> **Scope split (recorded during implementation).** US2 was planned as
> column + migration + **dual-read/write + integrity**. Grounding revealed that
> *activating* the column at runtime requires a **migrate-on-open** mechanism for
> existing databases (Python cannot apply a TS-authored migration, and the front
> door does not migrate existing DBs) — a high-blast-radius runtime-seam change,
> foundational well beyond this column. By Navigator decision that activation +
> adoption is split into **[CV22.DS6.US3](../cv22-ds6-us3-journey-hierarchy-activation/index.md)**.
> This story delivers the proven schema-authorship core. See
> [Decisions](../../../../decisions.md).

## Acceptance Behavior (delivered)

```text
Given a fresh database created by the TS bootstrap
Then the identity table has the parent_journey column + partial index (via
  createSchema), and migration 017 is a guarded no-op

Given a real legacy database copy (or fixture seed) with an identity table
When the TS engine runs migration 017 forward
Then parent_journey is added and backfilled to match each journey's JSON
  parent_journey (journey rows only), _migrations records 017 exactly once, and
  the schema matches Python's captured end-state PLUS exactly the enumerated
  TS-only additions

Given an existing database with every Python migration but not the TS-only 017
When a front-door command runs
Then the database is served (not refused); the JSON read path is unchanged

And the migration-id, structural-inventory, and legacy-fixture guards all hold
  the seam as TS ⊇ Python, failing on any drift outside the enumerated divergence
```

## Scope (delivered)

- `schema.ts`: `identity.parent_journey TEXT` + partial index `idx_identity_parent_journey`.
- `migrations.ts`: migration `017_journey_parent_column` (guarded on table
  existence, backfills journey rows from JSON, idempotent).
- `schemaState.ts`: `KNOWN_MIGRATION_IDS += 017`; new `TS_AUTHORED_MIGRATION_IDS`;
  `assertSchemaState` tolerates a DB missing only TS-authored migrations.
- Contract renegotiation to **TS ⊇ Python** via one shared, enumerated comparator
  (`schemaTsDivergence.ts`), applied to: the migration-id contract
  (`test_ts_schema_contract.py`, `==` → prefix), the structural-inventory guards
  (`schema.test.ts`, the Navigator parity script), and the legacy-fixture guard
  (`migrationFixtures.test.ts`).

## Out Of Scope (→ US3)

- **Migrate-on-open** activation of TS-authored migrations on existing databases.
- **Dual-write** (column + JSON) and **dual-read** (column, JSON fallback).
- Porting `_validate_parent_journey` integrity to TS.
- Dropping `parent_journey` from JSON / any hard FK (DS7/DS10).

## Validation

TS `330/330` green (incl. the 017 backfill test, the softened-guard tolerance
test, and all renegotiated guards); Python contract + db + journey suites green;
typecheck + lint clean. See [Plan](plan.md) and [Test Guide](test-guide.md).

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
