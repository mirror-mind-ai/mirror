# Plan — CV22.DS6.TS1

## Objective

Own the fresh-database **schema DDL** in the TS core. Port Python's `SCHEMA`
(`src/memory/db/schema.py`) into the TS `db/` seam — rewritten in English per
CV0 — and prove that a TS-created fresh database is **structurally identical**
(tables, columns, types, constraints incl. CHECK, indexes incl. partial
predicates, FTS5 config, triggers) to a Python-created one. This is the first
slice of schema custody: TS gains the ability to *produce* the schema, not just
read/write an inherited one.

## Scope

- Port the DDL to `ts/src/db/schema.ts` — every `CREATE TABLE`/`CREATE INDEX`,
  the `memories_fts` FTS5 external-content virtual table
  (`content=memories, content_rowid=rowid`), and the three FTS shadow triggers
  (`memories_fts_ai` / `_ad` / `_au`) — structurally faithful, comments in
  English per CV0. The identity-taxonomy enumerations in the `identity` and
  `consolidations` comments (`layer` ∈ self/ego/user/organization/persona/
  journey/journey_path; `key` ∈ soul/behavior/identity/principles/persona_id)
  are preserved **verbatim** in translation — they are a prompt-composition
  contract, not decoration.
- Add an idempotent `createSchema(db)` (preserves `IF NOT EXISTS` semantics)
  wired through the existing `ts/src/db/database.ts` `node:sqlite` driver seam.
- Prove structural parity of the created **schema objects** between a
  TS-created fresh DB and the committed Python schema-inventory snapshot, on
  temp files (no real data), in CI.

## Non-Goals

- **`_migrations` bookkeeping / baseline stamping → TS2.** On a fresh DB, Python
  runs `run_migrations` (stamping all 16 `KNOWN_MIGRATION_IDS`) *before*
  `SCHEMA`. A TS `createSchema` alone leaves `_migrations` empty, so it does not
  yet produce a schema-state-guard-valid database. Seeding `_migrations` and
  legacy forward-migration are TS2. This plan compares schema **objects**, not
  `_migrations`.
- **Front-door new-DB delegation flip → after TS1+TS2+TS3.** The DS2 decision
  (a missing database delegates to Python to bootstrap) stays until the full
  bootstrap trio exists in TS: schema (TS1) + migrations/`_migrations` (TS2) +
  cross-process locking and WAL/busy_timeout/FK pragmas (TS3). Flipping on TS1
  alone would create production databases without the bootstrap lock or WAL —
  unsafe. TS1 does not touch routing.
- Cross-process bootstrap locking, connection pragma discipline, and the
  **owner-only data-at-rest posture** (`0o700` dir, `0o600` file) → TS3, which
  must carry that posture as an explicit acceptance criterion. Python's secure
  create path stays authoritative until then.
- Any schema *change* — `identity.metadata` canonicalization (US1),
  `parent_journey` first-class column (US2).
- No behavior or semantic change; no migration of existing databases (`IF NOT
  EXISTS` makes `createSchema` a no-op against any populated DB).

## Parity Approach (structural, not textual)

CV0 rewrites DDL comments to English while the frozen Python DDL keeps its mixed
PT/EN comments, so raw `sqlite_master.sql` text will differ on the two commented
tables (`identity`, `consolidations`). Parity is therefore asserted
**structurally**, against a committed **schema-inventory snapshot** rather than a
live Python call (see Validation Route for why):

- object inventory from `sqlite_master` — same tables, indexes, triggers by
  name and type (**symmetric** diff: fail if either side has an extra object);
- per-table `PRAGMA table_info` — columns, declared types, `NOT NULL`, default
  values, PK membership/order;
- `PRAGMA index_list` + `index_info` — same indexes and uniqueness;
- **CHECK constraints and partial-index predicates** — invisible to
  `table_info`/`index_list`, so captured separately by normalized
  `sqlite_master.sql` comparison on the **comment-free** objects that carry them
  (`builder_refinement_stories`, `builder_change_requests`,
  `exploratory_stories`, and `idx_exploratory_stories_one_active_per_journey`),
  and cross-checked with a functional rejection test (insert an invalid
  `status` → assert rejected);
- `PRAGMA foreign_key_list` — same FK edges;
- FTS5: the `memories_fts` declaration (external-content wiring + default
  `unicode61` tokenizer) and the three trigger bodies, whitespace-normalized;
- `_migrations` is **excluded** (TS2 owns it).

**Blocking equivalence premise.** The Python snapshot is generated from a fresh
Python DB, i.e. `run_migrations` **then** `SCHEMA`; the TS side runs `SCHEMA`
only. The parity test therefore also proves that `SCHEMA` is a faithful squash
of the 16-migration chain. Any delta (a legacy index a migration left behind, a
column only one path produces) is a **blocking** finding — TS2's baseline-stamp
is unsound if this premise is false.

FTS is the subtlest surface, so parity includes a **functional probe**: insert a
`memories` row → assert findable through `memories_fts`; update → assert new
text matches and old does not; delete → assert gone. The probe includes a
**diacritic / non-ASCII** term (Mirror content is PT/EN-mixed), so a tokenizer /
`remove_diacritics` mismatch cannot hide behind an ASCII-only case.

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

## Validation Route

- **Oracle = committed snapshot, not a live Python call.** CI runs a separate
  Node job (Node 24, no `uv`/Python) and an unchanged Python job, so the Node
  test cannot shell `uv run python`. Instead, mirror the existing
  `KNOWN_MIGRATION_IDS` pattern: a Python step generates a canonical
  fresh-schema inventory (JSON) that is **committed**; a Python test regenerates
  and asserts it matches (drift guard — a Python schema change must update the
  snapshot in the same commit); the **hermetic** Node test creates a fresh DB
  via `createSchema()`, computes the same canonical inventory, and asserts it
  equals the committed snapshot.
- **Automated (CI, deterministic, data-free, release-blocking):** the Node test
  above + the FTS functional probe + idempotency + populated-DB no-op, all on
  temp files with per-test cleanup. No real `memory.db`, no network, no secrets.
  Failures emit a **readable structural diff** (which object/column/constraint
  differs), not a bare "not equal". This test is a release gate, same tier as
  the DS2 golden.
- **Navigator-visible route:** a script that builds a fresh TS DB and prints
  `STRUCTURAL PARITY: PASS/FAIL` against the snapshot with the schema-only
  inventory (redacted of any data).
  - *Expected observation:* `PASS`, identical inventories, FTS probe green.
  - *Pass condition:* zero structural deltas **and** FTS probe green.
  - *Fail condition:* any table/column/index/constraint/trigger/FTS delta, or
    FTS probe red.

**E2E decision:** recommend **fixture/temp-DB structural parity is sufficient** —
schema creation is deterministic and data-free, so no runtime end-to-end is
warranted. Requires explicit Navigator acceptance of the narrower route.

## Open Decisions (for approval)

1. **TS1 boundary** — TS1 = *DDL + structural object parity only*, with
   `_migrations` baseline (TS2), locking/pragmas + `0o700/0o600` posture (TS3),
   and the new-DB delegation flip (post-trio) explicitly deferred. Panel
   endorsed. *(Recommended.)*
2. **E2E** — accept the structural-parity + FTS-probe route as sufficient; no
   runtime E2E for TS1. *(Recommended.)*

## Plan Review (six-persona panel)

Reviewed at Plan time before implementation, per the DS5 handoff protocol.
Conditions below are folded into this plan.

- **database-architect — changes requested (folded):** CHECK constraints +
  partial-index predicates added to parity via comment-free `sqlite_master.sql`
  + functional rejection test; `SCHEMA` ≡ migrations-then-`SCHEMA` made a
  blocking acceptance criterion.
- **devops-engineer — changes requested (folded):** live `uv run python` in the
  Node job replaced by the committed-snapshot + Python drift-guard pattern;
  hermetic Node test; release-blocking CI gate; per-test temp cleanup.
- **quality-assurance — pass w/ conditions (folded):** idempotency, populated-DB
  no-op, symmetric diff, deterministic normalization + readable diff.
- **ai-engineer — pass w/ condition (folded):** diacritic/non-ASCII FTS probe;
  release-blocking gate.
- **security-engineer — pass (carried):** `0o700/0o600` owner-only posture named
  as a TS3 criterion; Python secure-create stays authoritative until then.
- **prompt-engineer — pass w/ condition (folded):** identity `layer`/`key`
  enumerations preserved verbatim in the English comment rewrite.

## Implementation Contract

- TDD: write the parity + FTS probe test first (red), then port the DDL to green.
- Zero runtime npm dependencies — `node:sqlite` only.
- The committed schema-inventory snapshot ships with its Python drift-guard test
  in the same change.
- Keep changes scoped to `CV22.DS6.TS1`; no `git add .`; story-scoped commits.
- Use `uv run` for the Python side of the snapshot generator/guard.
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
