[< Story](index.md)

# Plan — CV22.DS6.TS3

## Objective

Give the TS core its own bootstrap authority: a cross-process lock and
connection-pragma discipline equivalent to Python's
`src/memory/db/connection.py::get_connection`, so a TS-only process can create
and migrate a fresh `memory.db` safely — including when multiple processes
race on the same path — assembling TS1's `createSchema` and TS2's
`runMigrations` behind that lock.

This is the assembly point for DS6: after TS3, TS no longer needs Python to
bootstrap a database.

## Scope

- New `ts/src/db/bootstrap.ts`: orchestrates lock acquire → pragma
  discipline → `runMigrations` → `createSchema` → lock release. Composes
  TS1/TS2, does not reimplement them.
- `journal_mode=WAL` ownership, applied on the bootstrap connection, in
  Python's order: connect → `busy_timeout` → `foreign_keys` → `WAL` →
  `run_migrations` → `SCHEMA`. WAL is set outside any transaction, before
  migrations (which wrap each step in `withTransaction`).
- A **zero-dependency** cross-process lock: an atomic file primitive
  (`O_EXCL`, `O_NOFOLLOW`) on a sibling `.bootstrap.lock`, with stale-lock
  reclamation (pid liveness + mtime heuristic) as the accepted
  crash-safety-parity equivalent to `fcntl.flock`'s auto-release-on-death.
  No native addon — keeps CV22's single-language npm distribution goal
  intact.
- Owner-only permission posture (`0600` files, `0700` dirs) extended to the
  WAL sidecars (`-wal`/`-shm`) and the lock file, matching Python's rule of
  never mutating a pre-existing user directory's permissions.
- CI: add `uv` to the `ts` job (devops decision) so the cross-process /
  Python-oracle proofs run on the primary job instead of silently skipping,
  as `firstRun.test.ts` does today.
- **Front-door flip:** deliver and prove the capability in TS3. Flip the DS2
  "delegate to Python to bootstrap on missing DB" stopgap (routing +
  `firstRun.test.ts`) to TS **only if** the cross-process concurrency proof
  (A4) is green on CI. If it is not green by the end of this story, defer
  the flip to a named follow-up story rather than land it unproven.

## Non-Goals

- No native `flock` addon or other runtime dependency for locking.
- No in-process `worker_threads` locking — the runtime is single-process
  today; a synchronous cross-thread lock is explicitly out of scope and
  would risk deadlocking the event loop for no present benefit.
- No new schema decisions (`identity.metadata` canonicalization,
  `parent_journey` column) — those are US1/US2.
- No change to search/extraction/memory semantics.
- Do not implement sibling roadmap items: `identity.metadata`
  Canonicalization, `parent_journey` First-Class Column, or the parent
  Schema Custody Transfer delivery story itself.

## Acceptance Behavior

```text
Given a fresh database path with no existing memory.db
When the TS bootstrap path runs under the cross-process lock
Then the resulting database reports journal_mode=wal, busy_timeout=30000,
  and foreign_keys=ON
And the schema is structurally identical to a Python-bootstrapped database
  (tables, indexes, triggers, and the memories_fts FTS5 declaration/tokenizer)

Given an already-bootstrapped database
When TS bootstrap runs again
Then it is a no-op: no duplicate _migrations rows, identical schema

Given N concurrent real processes bootstrapping the same fresh path
When they race under the TS lock
Then exactly one performs the bootstrap work, no corruption occurs, and
  _migrations records each id exactly once

Given a lock left behind by a dead process (stale lock)
When a new bootstrap attempt runs
Then the lock is reclaimed within a bounded time and bootstrap proceeds

Given a live process holding the lock indefinitely
When a contender attempts to bootstrap
Then the contender fails with a clear, bounded error — no infinite spin, no
  silent unlocked bootstrap

And out-of-scope sibling roadmap items (identity.metadata, parent_journey,
  DS6 as a whole) remain untouched
```

## Validation Route

Risk-first, cheapest-to-deepest:

| # | Behavior | Level |
|---|----------|-------|
| A1 | Fresh TS bootstrap reports `journal_mode=wal`, `busy_timeout=30000`, `foreign_keys=ON` | unit (hermetic) |
| A2 | TS-bootstrapped fresh DB is schema-identical to Python-bootstrapped (tables/indexes/triggers, FTS5 decl + tokenizer, asserted after a clean WAL checkpoint) | integration (Python oracle) |
| A3 | Re-running bootstrap on an already-bootstrapped DB is a no-op | unit |
| A4 | N concurrent **real subprocesses** bootstrapping the same fresh path → winner-count = 1, ledger-once, valid final schema | integration (real subprocesses, requires `uv`) |
| A5 | Stale lock (holder pid dead) is reclaimed within a bounded window | unit |
| A6 | Live holder that never releases → contender fails closed with a clear, bounded error | unit |

A4 is the core proof and cannot be simulated with `Promise.all` in one
process — it must spawn real child processes.

Navigator-visible route: a redacted `ts/parity/bootstrap_custody_parity.*`
script that (1) bootstraps a fresh temp DB with TS, (2) structurally diffs it
against a Python-bootstrapped one, (3) races M concurrent TS bootstraps and
asserts winner-count = 1 with a single clean ledger. Output is redacted by
default (counts, hashes, pass/fail, winner count); no real DB artifact is
ever committed; all proofs run under `tmp/`, never against the live file.

- Expected observation: bootstrap_custody_parity reports `PASS` for schema
  parity, pragma presence, idempotency, and the concurrency race (winner
  count = 1).
- Pass condition: all six acceptance behaviors (A1–A6) hold in CI and in the
  redacted parity script; front-door flip lands only if A4 is green.
- Fail condition: any schema diff, any pragma missing, winner-count ≠ 1 in
  the concurrency race, or an unbounded/silent failure mode on lock
  contention.

E2E decision: **required**. Cross-process safety and Python-equivalence are
the story's entire point; both need real Python + real subprocesses. This
inherits the `firstRun.test.ts` constraint today, resolved by adding `uv` to
the `ts` CI job rather than mocking around it.

## Implementation Contract

- TDD/characterization tests for each acceptance behavior (A1–A6) before
  wiring them together in `bootstrap.ts`.
- Keep changes scoped to `CV22.DS6.TS3`: `ts/src/db/bootstrap.ts`, pragma
  ordering in `database.ts` only where WAL needs adding, CI config for `uv`
  on the `ts` job, and the front-door flip only if A4 is green.
- Lock-record typing must be explicit (no `any`); tests named for behavior,
  not implementation (e.g. "a stale lock left by a dead process is reclaimed
  within busy_timeout").
- Assert bounds and invariants in timing-sensitive tests (winner-count,
  "failed before 2× timeout"), never exact millisecond sleeps — CI runners
  are slow and jittery.
- Use uv run for Python commands and tests.
- Do not use `git add .`; commit only story-scoped files.
- Use descriptive English commit messages explaining why.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- A4 (cross-process concurrency proof) not green on CI → defer front-door
  flip to a named follow-up rather than land it unproven

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
