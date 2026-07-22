[< Parent](../index.md)

# CV22.DS6.US3 — Journey Hierarchy Activation & Migrate-on-Open

**Status:** 🟡 Planned
**Type:** User Story

---

## Outcome

Activate the `identity.parent_journey` column that [US2](../cv22-ds6-us2-parent-journey-first-class-column/index.md)
authored: give the TS front door a **migrate-on-open** path so existing
databases actually receive TS-authored forward migrations (Python cannot apply
them), then adopt the column at runtime — dual-write (column + JSON), dual-read
(column, JSON fallback), and the ported `_validate_parent_journey` integrity
rules. Dropping `parent_journey` from JSON and any hard FK stay deferred to
DS7/DS10.

## Why This Exists (split from US2)

US2 proved TS can author schema beyond Python (migration 017 + the column +
renegotiated seam contracts) and softened `assertSchemaState` so a database
missing the TS-only migration is *tolerated*. But nothing yet *applies* 017 to an
existing database, and the runtime read/write path still uses JSON. Turning
tolerance into activation is a high-blast-radius runtime-seam change,
foundational well beyond `parent_journey` — hence its own story (Navigator
decision; see [Decisions](../../../decisions.md)).

## Scope (planned)

- **Migrate-on-open:** when the front door opens a database missing TS-authored
  migrations, run them (backup-gated, under the bootstrap lock) before serving —
  the real "TS owns forward migration" behavior for existing databases.
- **Dual-write** `parent_journey` (column + JSON) in the TS journey write path.
- **Dual-read** (column when present, JSON fallback) in `journeyOptions` + caller.
- Port `_validate_parent_journey` to TS (parent-exists, no-self, single-level
  nesting, no-parent-if-has-children).

## Out Of Scope

- Dropping `parent_journey` from JSON, hard FK, Python reader re-homing — DS7/DS10.

## Depends On

- [CV22.DS6.US2](../cv22-ds6-us2-parent-journey-first-class-column/index.md) —
  the column, migration 017, and the softened schema-state guard.
