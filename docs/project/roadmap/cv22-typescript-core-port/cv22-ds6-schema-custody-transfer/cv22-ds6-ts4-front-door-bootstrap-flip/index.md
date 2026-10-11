[< Parent](../index.md)

# CV22.DS6.TS4 — Front-Door Bootstrap Flip: TS Owns First-Run Database Creation

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

The Pi front door creates a missing `memory.db` through the TS core
(`bootstrapDatabase`, delivered and proven in TS3) instead of delegating to
Python. The DS2 "when the database file does not exist, delegate to Python to
bootstrap it" stopgap is removed from `ts/src/frontDoor/cli.ts`. First run
becomes a single-language event: a TS-only install can create and serve its
database with no Python on the path, with no user-visible change.

## Story Statement

In order to remove the last DS2 Python-bootstrap delegation stopgap and let the
front door create databases through the TS core it already proved,
As the TS front door,
I want a missing `memory.db` to be bootstrapped by `bootstrapDatabase` under the
cross-process lock and pragma discipline,
So that first run no longer depends on Python and DS6 can advance toward
deleting the Python core.

## Acceptance Behavior

```text
Given a resolved db-path with no existing memory.db
When a TS-routed read command (journeys) runs through the front door
Then TS bootstraps the database (schema + full _migrations ledger, WAL,
  foreign_keys, owner-only 0600), the command is served from the TS core,
  exit code is 0, and no Python bootstrap is spawned

Given a resolved db-path with no existing memory.db
When a TS-routed write command (identity set / journey set-path) runs
Then TS bootstraps under the cross-process lock, the DS4 backup gate runs, the
  write succeeds, and the resulting database is a current-schema database

Given a missing memory.db
When consult (an external-API command) runs
Then no database is created — consult stays fail-soft and logs nothing

Given an already-bootstrapped memory.db
When any front-door command runs
Then behavior is unchanged: no re-bootstrap, existing routes serve as before

And out-of-scope sibling roadmap items remain untouched
```

## Scope

- New open-mode-agnostic helper `bootstrapDatabaseIfMissing(dbPath)` in
  `ts/src/db/bootstrap.ts`: when the file is absent, call `bootstrapDatabase`
  under the lock and close the returned connection; a cheap no-op when the file
  already exists.
- Wire it into the three first-run self-heal sites in
  `ts/src/frontDoor/cli.ts`, replacing
  `if (!existsSync(dbPath)) return fallbackPython(argv)`:
  - `runTs` (read commands — read-only open follows),
  - `withLiveWriteDb` (identity set / journey set-path — backup-gated write),
  - `runMemorySearch` (memories --search under replay — backup-gated write).
- Rewrite `ts/test/frontDoor/firstRun.test.ts` to prove **TS** self-heal and
  make it hermetic (drop the `uv` skip guard — bootstrap no longer needs uv).
- Replace the stale "delegate to Python to bootstrap" comments with the TS
  bootstrap rationale.
- Relocate this story package to the canonical DS6 folder and add its row to the
  parent DS6 candidate-stories table (done at Plan/Done bookkeeping).

## Out Of Scope

- `tryOpenDbForConsultLogging` (consult fail-soft logging) is **not** flipped —
  consult must never create a database as a logging side effect.
- No unification of the TS lock-file and Python `fcntl` lock primitives. The
  cross-engine first-run race is an accepted transitional edge; DS10 dissolves
  it by deleting Python.
- No change to `routing.ts`, schema, migrations, or any command semantics.
- Do not resolve the TS2 migration-`016` legacy-fixture debt (separate DS6 item).
- Do not fix the Ariad scaffolder path-slug convention (separate follow-up).

## Validation

Risk-first, mostly hermetic because TS3 already owns the heavy Python-oracle and
concurrency E2E for `bootstrapDatabase`:

- read self-heal → write self-heal (+ backup gate on a fresh DB) → idempotency →
  consult negative (no DB created) → existing-DB regression unchanged.
- E2E: a **Navigator smoke** against a fresh `MIRROR_HOME` (no `memory.db`),
  confirming a real front-door command serves and the DB is TS-created — offered
  as the narrower route in place of a new heavy harness, since TS3 owns the
  parity/concurrency proof. See [Plan](plan.md) and [Test Guide](test-guide.md).

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
