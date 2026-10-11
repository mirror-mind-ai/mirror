[< Parent](../index.md)

# CV22.DS6.TS3 — Cross-Process Locking & Connection Pragma Discipline

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

TS owns the last two pieces of database custody: the bootstrap/migration
cross-process lock and connection pragma discipline (WAL + busy_timeout +
foreign_keys), equivalent to Python's `src/memory/db/connection.py`. A
TS-only process can create and migrate a fresh `memory.db` safely, including
when multiple processes race on the same path, by assembling TS1's
`createSchema` and TS2's `runMigrations` behind this lock.

## Story Statement

In order to remove the DS2 Python-bootstrap delegation stopgap and let TS
fully own database creation,
As the TS core,
I want cross-process bootstrap locking and connection pragma discipline
equivalent to the Python core,
So that a TS-only install can create and migrate `memory.db` without ever
corrupting it under concurrent access.

## Acceptance Behavior

```text
Given a fresh database path with no existing memory.db
When the TS bootstrap path runs under the cross-process lock
Then the resulting database reports journal_mode=wal, busy_timeout=30000,
  and foreign_keys=ON, and is structurally identical to a Python-bootstrapped
  database

Given N concurrent real processes bootstrapping the same fresh path
When they race under the TS lock
Then exactly one performs the bootstrap work, no corruption occurs, and
  _migrations records each id exactly once

Given a stale lock left by a dead process, or a live holder that never
  releases
When a new bootstrap attempt runs
Then a stale lock is reclaimed within a bounded time, and a live holder makes
  the contender fail with a clear, bounded error

And out-of-scope sibling roadmap items remain untouched
```

## Scope

- New `ts/src/db/bootstrap.ts` composing TS1 (`createSchema`) + TS2
  (`runMigrations`) behind a zero-dependency cross-process lock.
- `journal_mode=WAL` ownership in Python's pragma ordering.
- Owner-only permissions extended to WAL sidecars and the lock file.
- Python-oracle and concurrency proofs run on the primary `ts` CI job (CR017
  had already added `uv` there; confirmed still true, stale comment in
  `firstRun.test.ts` corrected).
- Front-door flip of the DS2 Python-bootstrap-delegation stopgap: **deferred**
  even though its CI gate (concurrency proof green on real GitHub Actions,
  run 29837561016) is met — kept as a separately-scoped follow-up rather than
  riding in on this story. See [Review](review.md) for the debt record.

## Out Of Scope

- No native `flock` addon or other lock dependency.
- No in-process `worker_threads` locking.
- Do not implement sibling roadmap item: `identity.metadata` Canonicalization.
- Do not implement sibling roadmap item: `parent_journey` First-Class Column.
- Do not implement sibling roadmap item: Schema Custody Transfer.

## Validation

Risk-first: pragma presence → fresh-bootstrap Python-oracle equivalence →
idempotency → real cross-process concurrency race (winner-count = 1) →
stale-lock reclamation → bounded contention failure. E2E required (real
Python + real subprocesses) via a redacted `ts/parity/bootstrap_custody_parity`
script. See [Plan](plan.md) and [Test Guide](test-guide.md) for full detail.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Debt Review](review.md)
- [Done](done.md)
