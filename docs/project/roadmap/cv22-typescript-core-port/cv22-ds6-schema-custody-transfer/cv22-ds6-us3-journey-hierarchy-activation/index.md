[< Parent](../index.md)

# CV22.DS6.US3 — Journey Hierarchy Activation & Migrate-on-Open

**Status:** 🟡 In Progress
**Type:** User Story

---

## Outcome

Activate the `identity.parent_journey` column that
[US2](../cv22-ds6-us2-parent-journey-first-class-column/index.md) authored: give
the TS front door a **migrate-on-open** path so existing databases actually
receive TS-authored forward migrations (Python cannot apply them), then adopt the
column at runtime — dual-write (column + JSON), **JSON-authoritative dual-read**
(column is a not-yet-trusted shadow/index — see plan **D1**), and the ported
`_validate_parent_journey` integrity rules. Dropping `parent_journey` from JSON,
any hard FK, and making the column authoritative for reads stay deferred to
DS7/DS10.

## Why This Exists (split from US2)

US2 proved TS can author schema beyond Python (migration 017 + the column +
renegotiated seam contracts) and softened `assertSchemaState` so a database
missing the TS-only migration is *tolerated*. But nothing yet *applies* 017 to an
existing database, and the runtime read/write path still uses JSON. Turning
tolerance into activation is a high-blast-radius runtime-seam change.

## Approved Plan Decisions (see [plan.md](plan.md))

- **D1 — JSON authoritative, column is a shadow/index.** Dual-read resolves
  JSON-first; column-authoritative reads deferred to DS7. Navigator-approved,
  rewording US2's original "column-when-present" intent.
- **D2 — Migrate-on-open on read + write opens,** behind a cheap `_migrations`
  pre-check (steady state ≈ one query, no lock, no backup).
- **D3 — Conditional backup** owned by the migrate-on-open seam, only when a
  migration will actually apply.

## Scope

- **Migrate-on-open:** when the front door opens a database missing TS-authored
  migrations (and no Python migration is pending), run them backup-gated, under
  the bootstrap lock, before serving.
- **Dual-write** `parent_journey` (column + JSON, atomically) on the TS-owned
  write path.
- **JSON-first dual-read** in `journeyOptions` + caller; the column is a shadow.
- Port `_validate_parent_journey` to TS (parent-exists, no-self, single-level
  nesting, no-parent-if-has-children).

## Out Of Scope

- Dropping `parent_journey` from JSON, hard FK, Python reader re-homing,
  column-authoritative reads, the full `journey update` port — DS7/DS10.
- Migration-016 legacy fixture coverage — carried DS6-Done debt, independent of US3.

## Depends On

- [CV22.DS6.US2](../cv22-ds6-us2-parent-journey-first-class-column/index.md) —
  the column, migration 017, and the softened schema-state guard.

## Validation

See [test-guide.md](test-guide.md). Golden parity covers dual-read and
`_validate_parent_journey`; migrate-on-open has **no Python oracle** and is proven
by the real-legacy-DB-copy harness plus a Navigator E2E smoke.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
