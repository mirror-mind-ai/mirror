# Plan — CV22.DS6.US3 — Journey Hierarchy Activation & Migrate-on-Open

> Drafted by **quality-assurance**, reviewed by **engineer**, **database-architect**,
> **security-engineer**, **ai-engineer**, **prompt-engineer**, and **devops-engineer**.
> Navigator approved the Q1 direction (JSON-authoritative, column-as-shadow) before materialization.

## Objective

An existing `memory.db` that predates migration `017`, when first opened by the TS
front door, is **backed up and forward-migrated by TS** (the `identity.parent_journey`
column appears, backfilled from JSON) **before serving** — and every runtime read of
journey hierarchy is identical to the Python oracle both before and after that
migration. The only new observable is a one-time backup + migration on the first
post-upgrade open. No user-visible change in command output.

## The Decisive Asymmetry (why this story is not routine)

- Migration `017` and the `identity.parent_journey` column are **TS-only**. Python's
  `MIGRATIONS` stops at `016`; Python's `schema.py` has no such column
  (`grep` confirmed). **Python physically cannot apply `017`.**
- Python's `get_connection` runs `run_migrations` on *every* open, but the TS front
  door's `bootstrapDatabaseIfMissing` **early-returns when the file exists**
  (`ts/src/db/bootstrap.ts`), so on an existing DB migrations never run.
- Net today: on an existing DB, `017` is applied by **no one**; the column stays
  dormant, *tolerated* by the softened `assertSchemaState`
  (`TS_AUTHORED_MIGRATION_IDS = {017}`). Migrate-on-open is the **only** path that
  ever activates it.
- `parent_journey` is *set* today through Python's `journey update` path
  (`routing.ts` keeps it on Python fallback), which writes **JSON only**. So two
  writers touch hierarchy (Python JSON, TS migrate/create) and only one derived
  column exists → **drift is structurally guaranteed** unless a single writer owns
  both representations.

## Approved Design Decisions

- **D1 — JSON is authoritative; the column is a denormalized shadow/index (Q1).**
  Dual-read resolves **JSON-first**; the column is not yet trusted as the source of
  truth. This keeps the Python oracle exact (Python reads JSON), makes the read path
  golden-parity-able, and avoids dragging the `journey update` write port into US3.
  *This reworded the US3 index intent ("column-when-present"); Navigator signed off.*
  Column-authoritative reads are deferred to DS7.
- **D2 — Migrate-on-open fires on both read and write serving (Q2)**, behind a cheap
  `_migrations` pre-check so the steady state (already-migrated DB) costs ~one indexed
  query — no lock acquire, no backup.
- **D3 — Conditional backup (Q3)**, owned by the migrate-on-open seam (not the
  per-write `ensureBackup`), taken **only** when a migration will actually apply.

## Scope

1. **Migrate-on-open** — a new seam (`ensureMigratedOnOpen(dbPath, …)` next to
   `bootstrapDatabaseIfMissing` in `ts/src/db/`) that: reads `_migrations`; if any
   `KNOWN_MIGRATION_IDS` that is TS-authored is pending, acquires the bootstrap lock,
   takes a conditional backup, runs `runMigrations` (idempotent, per-migration commit),
   and closes; otherwise no-ops. Wired into `runTs` **and** `withLiveWriteDb` in
   `cli.ts`, before the serving connection opens.
2. **Dual-read** — the SQL that fetches `journey` identity rows also selects the
   `parent_journey` column; a single **JSON-first resolver** produces the effective
   parent. `listJourneyOptions` stays a pure function over rows (no DB access pushed in).
3. **Dual-write** — where TS owns the write (`createJourney`), write column + JSON
   **atomically** in one `withTransaction`. The parent *update* path stays on Python
   (out of scope), so the column is maintained only by create + the migrate backfill;
   JSON remains the source of truth.
4. **Port `_validate_parent_journey`** — a pure `validateParentJourney` over an injected
   lookup/list seam, enforcing the four rules, reading parent info through the **same**
   JSON-first resolver used by dual-read (so validation and listing never disagree).

## Non-Goals

- Dropping `parent_journey` from JSON; any hard FK or self-referential constraint — DS7/DS10.
- Re-homing the Python reader; porting the full `journey update`/`status` command surface — DS7.
- Making the column authoritative for reads — DS7 (recorded as debt).
- Migration-`016` legacy fixture coverage — carried DS6-Done debt, **independent of US3**.
- Any sibling DS6 item (schema custody transfer at large).

## Parity-Oracle Map (the QA headline)

US3 is **not** uniformly golden-parity-able:

| Sub-behavior | Python oracle? | Validation regime |
|---|---|---|
| `list_journey_options` dual-read | **Yes** (reads JSON) | Golden parity — identical output whether resolved from column or JSON |
| `_validate_parent_journey` (4 rules) | **Yes** | Golden parity on a branch-covering fixture |
| **migrate-on-open** | **No** — Python can't apply `017` | TS behavioral + **real-legacy-DB-copy** contract only |

## Acceptance Behavior

```text
A1  Open a copied legacy DB (no 017) via a read command
      -> a backup is created, _migrations gains 017,
         identity.parent_journey is backfilled from JSON,
         `journeys` ordering is unchanged.
A2  Open the same DB again
      -> no new backup, no re-migration, no duplicate _migrations row (idempotent).
A3  `journeys` output is identical column-present vs column-absent for the same JSON.
A4  Each _validate_parent_journey rule accepts/rejects exactly as Python
      (self / missing parent / two-level nesting / journey-with-children).
A5  A DB missing a *Python* migration is still refused (softened guard's other arm holds).
A6  Two processes opening the same stale DB concurrently do not double-apply or corrupt;
      a mid-migration crash leaves a restorable backup and a resumable _migrations state.
```

## Validation Route

- **Golden parity (CI):** A3, A4 on committed synthetic goldens (regenerate = no-op gate).
- **TS behavioral (CI):** migrate-on-open unit behavior, dual-write atomicity, resolver precedence.
- **Real-legacy-DB-copy harness (redacted):** A1, A2, A5, A6 over a copied demo DB, never the live file.
- **E2E decision: required.** Migrate-on-open has no golden oracle; a Navigator-run
  real-DB-copy smoke is the only end-to-end exercise (backup created, column applied,
  `journeys` ordering unchanged). See `test-guide.md` for the route.

## Cross-Cutting Requirements (from the panel)

- **Observability (security + devops):** a `migrate_on_open` front-door log event records
  migration ids applied, backup path, and duration — **never** journey/identity content
  (extends OPS CR026 posture). A redaction check is part of acceptance.
- **Backup posture (security):** the migrate-on-open backup lands in the owner-only backup
  dir with `0600`; it is a full second copy of the identity store, so location/perms are asserted.
- **Rollback runbook (devops):** backup-first + per-migration commit ⇒ failure runbook is
  "restore backup, report failing migration id." A crash-injection test proves restorability (A6).
- **Hot-path cost (devops):** already-migrated open adds one indexed `_migrations` query on the
  already-open handle — no second connection, no speculative lock/backup.

## Debt to Record (not build in US3)

- **Column not authoritative for reads** (JSON-first shadow) — promote in DS7.
- **Single-level-nesting invariant is application-enforced only** — no DB `CHECK`/self-FK
  yet; the column makes one possible in DS7/DS10.

## Implementation Contract

- TDD: red test per acceptance behavior before implementation; keep changes scoped to `CV22.DS6.US3`.
- `journeyOptions` stays pure; migrate-on-open composes `acquireBootstrapLock` + `runMigrations` (no forked discipline).
- Use `uv run` for Python commands and tests; TS via the project's node test runner.
- No `git add .`; commit only story-scoped files. Descriptive English commit messages explaining *why*.
- Never prove write/migration parity against the live production database — copies only.

## Stop Conditions

- scope_change_detected (e.g. Q1 reopened → column-authoritative pulls in the `journey update` port)
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
