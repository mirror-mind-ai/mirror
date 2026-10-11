# Plan — CV22.DS6.TS4

## Objective

Flip the front-door first-run path so TS owns database creation via the
`bootstrapDatabase` capability delivered in TS3, removing the DS2 "delegate to
Python to bootstrap a missing database" stopgap from `ts/src/frontDoor/cli.ts` —
with no user-visible change.

## Scope

- Add `bootstrapDatabaseIfMissing(dbPath)` to `ts/src/db/bootstrap.ts`: an
  open-mode-agnostic guard that bootstraps only when the file is absent and
  closes the returned connection. Common case (DB exists) is a single
  `existsSync` no-op — the per-command hot path is not burdened with a lock
  acquire.
- Replace the three `if (!existsSync(dbPath)) return fallbackPython(argv)`
  self-heal points in `cli.ts` (`runTs`, `withLiveWriteDb`, `runMemorySearch`)
  with a call to the helper, then let each site open in its existing mode
  (read-only, or backup-gated write).
- Rewrite `firstRun.test.ts` to prove TS self-heal, hermetically.
- Update stale comments.
- Roadmap bookkeeping: relocate the story package under the canonical DS6
  folder, add the TS4 row to the DS6 index table, reconcile the stale
  `roadmap position: CV9.DS7` cursor pointer to CV22.DS6.

## Non-Goals

- Do not flip consult's fail-soft logging path — it must not create a DB.
- Do not unify the TS/Python lock primitives (cross-engine race accepted;
  DS10 removes Python).
- Do not touch `routing.ts`, schema, migrations, or command semantics.
- Do not silently absorb adjacent roadmap work (TS2 migration-016 debt; the
  Ariad scaffolder path-convention fix).

## Acceptance Behavior

```text
Given a resolved db-path with no existing memory.db
When a TS-routed read command (journeys) runs through the front door
Then TS bootstraps the database (schema + full _migrations ledger, WAL,
  foreign_keys, owner-only 0600), it is served from the TS core, exit 0, and
  no Python bootstrap is spawned

Given a resolved db-path with no existing memory.db
When a TS-routed write command (identity set / journey set-path) runs
Then TS bootstraps under the cross-process lock, the backup gate runs, the
  write succeeds, and the result is a current-schema database

Given a missing memory.db
When consult (external-API command) runs
Then no database is created — consult stays fail-soft and logs nothing

Given an already-bootstrapped memory.db
When any front-door command runs
Then behavior is unchanged (no re-bootstrap, existing routes serve as before)

And out-of-scope sibling roadmap items remain untouched
```

## Multi-Persona Plan Review (pre-implementation)

Panel run at the baton boundary per the CV22 collaboration strategy.

### Engineer

- Centralize, do not sprinkle: one `bootstrapDatabaseIfMissing` helper honors
  DRY and gives the three call sites a single, testable seam. The helper stays
  **open-mode-agnostic** — it only guarantees the file exists and is current;
  each site keeps its own read-only / backup-gated-write open.
- Accept a deliberate deviation from `bootstrapDatabase`'s "use the returned
  connection, do not reopen" guidance: the helper closes it and the site
  reopens in the mode it needs. Cost is one extra open on the first-run path
  only — negligible, and it keeps bootstrap decoupled from serving.
- Minimal blast radius: no `routing.ts` change, no `dispatch` change. Remove the
  now-dead "delegate to Python" comments so the code stops lying.

### QA

- The current test only proves *Python* self-heal and is skipped without `uv`.
  Rewrite to prove *TS* self-heal and drop the skip guard — first-run coverage
  becomes hermetic and always runs.
- Cases: (1) missing DB + read → bootstrap + serve; (2) missing DB + write →
  bootstrap + backup + write; (3) idempotency — second call does not
  re-bootstrap or error; (4) **negative**: consult on missing DB creates no DB;
  (5) regression — existing-DB routes unchanged.
- Concurrency is already covered by TS3's suite over `bootstrapDatabase`; TS4
  references it rather than duplicating a race test.

### Database architect

- No new schema semantics: TS3 already proved TS bootstrap is schema-identical
  to Python, with the full `_migrations` ledger. TS4 is wiring.
- Assert the first-run **write** path is safe: `ensureBackup` runs against a
  freshly bootstrapped DB before the first write. Backing up a fresh DB is
  trivial but must not error — cover it.
- The reopened connection re-applies standard pragmas (busy_timeout,
  foreign_keys) via `openDatabaseForWrite`/`openDatabaseReadOnly`; WAL is a
  persistent file property set once at bootstrap. No pragma drift between the
  bootstrap connection and the serving connection.

### DevOps

- Hermeticity win: dropping `uv` from the first-run test removes a cross-language
  dependency from that path. Keep TS3's `bootstrap_custody_parity` as the
  standing CI proof that TS bootstrap == Python bootstrap; do not duplicate it.
- First-run latency now includes the bounded (30s-timeout) synchronous
  bootstrap lock — bootstrap-only, same discipline TS3 shipped. Acceptable.
- Reconcile the stray `docs/project/roadmap/cv22/` tree the scaffolder created;
  raise the scaffolder slug-convention mismatch as a separate follow-up since it
  will recur on every future pulled story.

### Security

- Owner-only posture is inherited and actually stronger under TS ownership:
  `bootstrapDatabase` chmods 0600 on the DB + WAL sidecars and 0700 on a created
  parent dir; the lock uses `O_EXCL | O_NOFOLLOW`. Confirm the reopen does not
  loosen perms.
- Honest gap: a front-door TS first-run (lock file) and a directly-invoked
  Python first-run (`fcntl` flock) share the lock **path** but not the lock
  **primitive**, so they are not mutually exclusive. Low probability (single
  user, first-run only, identical resulting schema). Disposition: documented
  transitional risk, same spirit as TS3's fcntl-vs-lockfile gap; DS10 dissolves
  it by deleting Python. Do not attempt primitive unification in TS4.
- Keep the consult negative test — an external-API command must not provision
  storage as a side effect.

## Validation Route

- Automated (hermetic, CI): rewritten `firstRun.test.ts` (read self-heal, write
  self-heal + fresh-DB backup, idempotency, consult-negative), existing
  `bootstrap*`/concurrency suites unchanged; `npm run` typecheck + lint + tests
  in `ts/`; `.pi` TypeScript check.
- Navigator smoke (E2E): point `MIRROR_HOME` at a fresh temp dir with no
  `memory.db`; run `node ts/src/frontDoor/cli.ts journeys` (and one write, e.g.
  `journey set-path`); confirm real output, `memory.db` created by TS (WAL
  sidecar present, `_migrations` fully populated), and no `uv`/Python bootstrap
  on the path.
  - Expected observation: the journey list renders; the DB now exists,
    `journal_mode=wal`, `_migrations` holds every `KNOWN_MIGRATION_ID`.
  - Pass: command exits 0 with real content; DB present and current-schema;
    bootstrap not routed to Python.
  - Fail: nonzero exit, DB absent, or bootstrap delegated to Python.

E2E decision: **required, narrowed to a Navigator smoke** — the heavy
Python-oracle + real-process concurrency E2E already lives in TS3
(`bootstrap_custody_parity`). TS4's incremental risk is wiring, covered by the
hermetic tests plus one smoke. Requires explicit Navigator acceptance of the
narrower route.

## Implementation Contract

- TDD: rewrite the first-run test first (red), then flip the call sites (green),
  then refactor comments.
- Keep changes scoped to `CV22.DS6.TS4`; no `git add .` — commit only
  story-scoped files with a descriptive English message explaining why.
- Use `uv run` for any Python commands and tests.

## Stop Conditions

- scope_change_detected (e.g. a fourth flip site or a schema/route change appears)
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed (E2E-narrowing acceptance; package relocation)

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
