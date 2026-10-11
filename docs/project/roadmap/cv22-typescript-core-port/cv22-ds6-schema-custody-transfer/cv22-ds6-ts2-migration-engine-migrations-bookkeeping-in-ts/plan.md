# Plan — CV22.DS6.TS2

**Drafted by:** quality-assurance (Navigator request: ground in the actual
migration code; QA drafts, the remaining technical team — including engineer —
reviews). Revised after six-persona Plan review; see Plan Review below.

## Objective

Port the migration engine (`src/memory/db/migrations.py`'s `MIGRATIONS` list +
`run_migrations`) to TS, and prove — not assume — that it reproduces Python's
real behavior across the **full range of states an installed database can
actually be in**, not just "a fresh database looks right at the end." TS1
proved the end-state schema shape; TS2 must prove the **engine that gets
databases to that shape**, including the transition logic that only exists to
handle histories TS1's fresh-DB proof never exercised.

## Why fresh-DB testing alone is not sufficient here (the release-confidence gap)

Reading `migrations.py` closely surfaces something TS1 did not need to worry
about: several migrations' real bodies are **dead code on a from-scratch fresh
database** and only execute against a genuinely older, already-existing
database:

- **001 (`project_to_travessia`) and 005 (`travessia_to_journey`)** — legacy
  Portuguese-era renames. Every internal check (`_table_exists`,
  `_rename_column_if_needed`) guards against a table that doesn't exist yet, so
  on a from-scratch DB these are no-ops in every place except the tables
  `002`/`003` already created earlier in the same run (`attachments`, `tasks`) —
  `conversations`/`memories`/`identity` don't exist yet at that point in a
  fresh bootstrap, so their rename/value-migration branches never fire there.
- **008 (`create_memories_fts`) and 009 (`memories_reinforcement_columns`)**
  explicitly `return` early ("Fresh database: SCHEMA will create ... when it
  runs after migrations") — their real DDL bodies are *only* exercised against
  a database that has `memories` but doesn't yet have `memories_fts` /
  the reinforcement columns.
- **016 (`builder_workbench_display_codes`)** — its `ALTER TABLE ... ADD COLUMN
  display_code` branch only fires if `display_code` is missing. On a
  from-scratch run, migration `015` already creates the column inline, so
  `016`'s ADD-COLUMN branch — and its backfill logic against **pre-existing
  rows** — is dead code in that scenario. It only proves anything against a
  database that was really migrated from before `015` grew that column.

**Release-confidence consequence:** a test suite that only ever migrates a
fresh empty database (which is what today's `tests/unit/memory/db/
test_migrations.py` does, via the already-modern `db_conn` fixture — every
migration no-ops there) would pass while leaving the actual transition logic
for 001/005/008/009/016 completely unproven. Only `test_english_schema_
migration.py` exercises a real pre-state today (a hand-built legacy schema,
covering migrations 001+005 only). **There is no existing Python fixture for
"a database at migration state N" for most of the 16 steps.** TS2 cannot
credibly claim "proven over real legacy databases" without building that
oracle first — on the Python side, since Python's migration engine is the
frozen source of truth here, not just on the TS side.

## Verified Assumptions (checked, not just asserted)

- **Collation.** `schema.py`/`migrations.py` have zero explicit `COLLATE`
  clauses anywhere (grep-confirmed). Every `ORDER BY` — including `016`'s
  display-code backfill (`position ASC, created_at ASC, id ASC` /
  `created_at ASC, position ASC, id ASC`) — runs under SQLite's default
  `BINARY` collation on both runtimes. Safe because verified, not assumed.
- **FK enforcement during migration.** Every connection runs with `PRAGMA
  foreign_keys=ON` (`connection.py`). A rename or backfill against genuinely
  messy legacy data could in principle trip a dangling reference — Track B
  fixtures must include this as a deliberate consideration, not assume legacy
  data is always clean (database-architect).

## Scope

1. **Port** `MIGRATIONS` (all 16 steps) + `run_migrations` to
   `ts/src/db/migrations.ts`, function-for-function, preserving every early-return
   guard exactly (the guards are the load-bearing logic per the finding above).
2. **Extract a shared seed-builder helper first** (engineer condition), before
   writing fixture #1 — a small function that constructs "shape at state N"
   connections, so fixtures #2–9 compose rather than duplicate ~40 lines of
   near-identical boilerplate each.
3. **Build legacy-state seed fixtures**, purely synthetic, never derived from a
   real captured database (security-engineer condition — same PII posture as
   the DS2 goldens, and identity-shaped content must not even *read* as real
   personal content). For each migration whose body has non-trivial logic —
   001, 002, 003, 004, 005, 008, 009, 015, 016 — construct a synthetic
   pre-migration-N database (old table/column shapes + representative rows
   where a rename or backfill is involved), extending the existing pattern in
   `test_english_schema_migration.py`'s `_old_schema_conn()`, as **committed
   inline Python-literal fixtures** (matching that file's existing style —
   resolved, see Decisions below).
4. **Two-track parity proof**, both grading against Python as the oracle, with
   the **multi-hop chain elevated to the primary acceptance proof**
   (database-architect condition — a real upgrade is one long-lived database
   walking forward through all 16 steps, not 9 independent scenarios; the
   per-migration fixtures are diagnostic aids for isolating *which* step
   failed when the multi-hop does):
   - **Track A — fresh-DB ledger completeness** (extends TS1, which explicitly
     deferred `_migrations`): run the TS migration engine + `createSchema` on
     an empty file; assert `_migrations` contains all 16
     `KNOWN_MIGRATION_IDS` — including the ids whose bodies no-op, since
     Python's loop records the id regardless of whether the body did real
     work. This is the proof `schemaState.ts`'s `assertSchemaState` (already
     live and already gating the front door) needs to eventually accept a
     TS-bootstrapped database.
   - **Track B — legacy-transition state-diff** (the genuine "custody" proof,
     primary = multi-hop, secondary = per-migration diagnostics): for the
     multi-hop fixture (seeded at the oldest pre-001 state) and each
     per-migration pre-state fixture, run Python's real `run_migrations` on
     one copy and the TS port on a parallel copy of the *same seed*; diff the
     end state. Reuses TS1's `buildSchemaInventory`/`schema_inventory.py`
     contract for schema shape, extended with (a) `_migrations` ledger
     row-set comparison, (b) row-level data assertions for the migrations
     that move *values*, not just shape (travessia→journey renames including
     `identity.layer` values — prompt-engineer condition, the same taxonomy
     TS1's schema comments now document verbatim — and the `builder_*`
     display-code backfill against pre-existing rows), and (c) a **functional
     search assertion** for migration 008 specifically (ai-engineer
     condition): a pre-existing `memories` row must actually be findable via
     `memories_fts` after migration, not merely have the virtual table exist
     — the same class of risk as a silent retrieval-degrading bug.
5. **Idempotency**: running the full migration set twice (TS side) is a
   no-op — mirrors the existing (currently fresh-DB-only) Python idempotency
   test, now also proven against a mid-transition seed.
6. **Partial-failure resumability** — **in scope** (resolved; was an open
   question, decided via the security-engineer condition: a half-migrated
   database is an integrity concern, not merely a functional gap, and the
   test is cheap). `run_migrations` commits each migration individually and
   only rolls back the *currently failing* one — migrations 1..N-1 stay
   applied, migration N is retried on the next run
   (`migrations.py`'s own module docstring). Simulate an injected failure,
   assert partial commit + correct resumption on retry.

## Non-Goals

- **Cross-process bootstrap locking / concurrent-startup safety** — CV22.DS6.TS3.
  This plan explicitly does *not* attempt to prove concurrent-migration safety;
  `migrations.py`'s docstring mentions concurrent partial-application
  tolerance, but the actual **lock** that makes concurrent startup safe is
  TS3's `fcntl`-equivalent, not TS2's. TS2 proves the engine is *idempotent
  and resumable*, which is what TS3's lock will rely on — it does not itself
  prove concurrency safety.
- **Connection pragma discipline** (WAL, busy-timeout, FK enforcement as a
  connection-level concern) — TS3.
- **Front-door new-DB delegation flip** — still deferred; TS1 already named
  this as needing the full trio (schema + migrations + locking/pragmas).
  TS2 completes 2 of 3.
- **Any new schema change** — `identity.metadata` canonicalization (US1),
  `parent_journey` column (US2). TS2 ports the *existing* 16 migrations
  exactly; it does not add a 17th.
- **No behavior change** — this is a port, not an improvement, even where the
  Python migration logic looks incidentally imperfect (see the `tasks`/
  `builder_workbench` column-order lessons from TS1 — the target is Python's
  *actual* behavior, warts included, not a cleaner reimagining).

## Acceptance Behavior

```text
Given a fresh SQLite database
When the TS migration engine + createSchema() run against it
Then `_migrations` contains exactly the 16 KNOWN_MIGRATION_IDS
And the resulting schema is structurally identical to TS1's committed snapshot

Given the synthetic multi-hop database seeded at the oldest pre-001 state
When Python's run_migrations and the TS port each run the full 16-step chain
  forward on a parallel copy of the same seed
Then the resulting schema (shape), `_migrations` ledger (rows), and all
  migrated row-level values (renamed columns, identity.layer values,
  backfilled display codes) are identical
And a pre-existing memories row is findable via memories_fts after migration
  (functional, not merely structural)

Given each individual pre-migration-N fixture (001, 002, 003, 004, 005, 008,
  009, 015, 016)
When both engines run that step forward
Then the same per-step diagnostic comparison passes, isolating which step is
  at fault if the multi-hop fails

Given the full migration set has already been applied
When it is run again
Then it is a no-op: no error, no duplicate `_migrations` rows, no schema change

Given a migration fails partway through (simulated)
When the engine is invoked again
Then migrations before the failure remain committed and recorded, the failing
  one is not recorded, and the retry resumes from exactly that point
```

## Validation Route

- **Oracle generation is Python-first, and the CI pattern is explicit, not
  implied** (devops-engineer condition — this is the exact three-part pattern
  TS1 landed on, not a new one): a Python step generates each fixture's
  expected end-state (schema shape via `schema_inventory.py`, `_migrations`
  rows, and migrated row values) and **commits** it; a Python test
  drift-guards each committed expectation against a live re-run; the TS test
  consumes the committed seed + expected state **hermetically** — zero live
  Python calls at Node-test runtime, matching the Node CI job's real topology
  (no `uv`/Python available there).
- **Fixture naming convention** (devops-engineer condition): `migration-{NNN}-
  pre-state.*` per per-migration fixture (e.g. `migration-001-pre-state`),
  plus one `migration-chain-multi-hop-pre-state` for the primary multi-hop
  fixture — so a CI failure maps directly to a migration without spelunking.
- **Automated (CI-safe, data-free, release-blocking):** committed synthetic
  seed fixtures (schema + representative rows, purely synthetic, no real
  content) drive both Track A and Track B in CI.
- **Navigator-visible route:** extend `ts/parity/schema_structural_parity.ts`
  (or a sibling script) to also report per-migration-checkpoint pass/fail, the
  `_migrations` ledger comparison, and the multi-hop result, ending in one
  summary line.
- **E2E decision:** **not required** — same reasoning as TS1 (deterministic,
  data-free); the larger surface area is addressed by the multi-hop-as-primary
  structure above, not by a runtime E2E.

## Decisions (resolved at Plan review)

1. **Scope size — keep as one story.** Land it as a true migration-by-migration
   sequence of small, working commits (red → green per migration, in
   dependency order — 004 depends on 003's table, 005 depends on 002/003's
   columns, etc.), not one large diff. Reassess mid-story only if the fixture
   pattern proves genuinely unrepeatable after the first 2-3 migrations.
2. **Partial-failure resumability — in scope** (see Scope item 6 above).
3. **Fixture provenance — inline Python-literal fixtures**, matching
   `test_english_schema_migration.py`'s existing style, for reviewability and
   consistency with established convention.

## Plan Review (six-persona panel)

Reviewed at Plan time before implementation, per the DS5/TS1 handoff
protocol. QA drafted; the remaining technical team reviewed, including
engineer this time (rotation from TS1, where engineer drafted and QA
reviewed). Conditions below are folded into this plan.

- **engineer — pass w/ conditions (folded):** extract a shared seed-builder
  helper before the first fixture (avoid 9x duplication); land as
  migration-by-migration small commits, not one large diff.
- **database-architect — pass w/ conditions (folded):** collation assumption
  verified (no `COLLATE` anywhere) rather than merely assumed; FK-enforcement
  against messy legacy data named as a fixture consideration; multi-hop
  elevated to the primary acceptance proof, per-migration fixtures as
  diagnostics.
- **security-engineer — pass w/ conditions (folded):** fixtures purely
  synthetic, never derived from a real captured database; identity-shaped
  fixture content must not read as real personal content; partial-failure
  resumability kept in scope as an integrity concern, not silently dropped.
- **devops-engineer — changes requested (folded):** the Python-generates/
  commits + Python-drift-guards + TS-hermetic-consumes pattern made explicit
  (mirrors TS1, not a new pattern); fixture naming convention adopted.
- **ai-engineer — pass w/ condition (folded):** migration 008's fixture
  requires a functional FTS search assertion (a pre-existing row must be
  findable after migration), not merely structural virtual-table existence.
- **prompt-engineer — pass w/ condition (folded):** the 001/005 fixture
  includes `identity` rows at old layer values, proving they land on the
  modern taxonomy strings TS1 already committed verbatim.

## Implementation Contract

- TDD: write the shared seed-builder helper first, then per migration —
  fixture + parity test first (red), then port that migration's TS function
  to green — working forward through the 16 in dependency order.
- Land as a sequence of small, story-scoped commits (one or a few migrations
  per commit), not one large diff.
- Zero runtime npm dependencies — `node:sqlite` only.
- Reuse TS1's `buildSchemaInventory`/`schemaInventory.ts` for shape comparison
  rather than re-deriving it — DRY, and it is already proven.
- Fixtures are purely synthetic; never derive from or resemble real captured
  database content.
- Keep changes scoped to `CV22.DS6.TS2`; no `git add .`.
- Descriptive English commit messages explaining why.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
