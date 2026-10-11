[< Story](index.md)

# Test Guide — CV22.DS6.TS3

## Automated Validation

Hermetic (Node-only) unit tests:

- **A1 — pragma presence.** A fresh TS bootstrap reports `journal_mode=wal`,
  `busy_timeout=30000`, `foreign_keys=ON` on the resulting connection.
- **A3 — idempotency.** Running bootstrap twice against the same path
  produces no duplicate `_migrations` rows and an identical schema snapshot.
- **A5 — stale-lock reclamation.** A lock file left by a process whose pid is
  no longer alive is reclaimed within a bounded window, and bootstrap
  proceeds instead of hanging.
- **A6 — bounded contention failure.** A live lock holder that never
  releases makes a contender fail closed with a clear error before an
  explicit timeout bound (assert "failed before 2× timeout", not an exact
  sleep duration).

Integration tests requiring `uv` + Python (added to the `ts` CI job per the
CI-topology decision):

- **A2 — Python-oracle schema parity.** A TS-bootstrapped fresh database is
  structurally identical to a Python-bootstrapped one: same tables, columns,
  indexes, triggers, and the same `memories_fts` FTS5 declaration and
  tokenizer config — asserted via schema introspection after a clean WAL
  checkpoint (not a raw table-count diff, and not while uncommitted WAL
  frames could be present).
- **A4 — real cross-process concurrency.** N real child processes bootstrap
  the same fresh path concurrently. Assert: exactly one process performs the
  bootstrap work (winner-count = 1), no corruption in the final schema, and
  `_migrations` records each migration id exactly once. Must spawn real
  subprocesses — `Promise.all` within one process does not exercise the
  cross-process lock and is not an acceptable substitute.

## E2E Decision

**Required.** Cross-process safety and Python-equivalence are the entire
point of this story; both require real Python and real subprocess spawning.
No narrower fixture-level substitute was accepted for A2/A4.

## Navigator Validation

Run the redacted parity script:

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
# TS bootstrap + Python-oracle diff + concurrency race
node --experimental-strip-types ts/parity/bootstrap_custody_parity.ts
```

- **Expected observation:** the script reports `PASS` for schema parity,
  pragma presence, idempotency, and the concurrency race, with a
  winner-count of 1 and a single clean `_migrations` ledger. Output is
  redacted (labels, counts, hashes, pass/fail) — no raw ids, content, or
  fixture JSON.
- **Pass condition:** all of A1–A6 hold, both in CI and in the parity script
  run against a real (demo/copied) database.
- **Fail condition:** any structural schema diff against the Python oracle,
  any missing pragma, a winner-count other than 1 in the concurrency race,
  duplicate `_migrations` rows on re-bootstrap, or a contention failure that
  is unbounded or silently proceeds without the lock.

## Front-Door Flip Gate

The DS2 "delegate to Python to bootstrap a missing database" stopgap
(`firstRun.test.ts` + routing) is flipped to TS **only if A4 is green on
CI**. If A4 is not green by the end of this story, the flip is deferred to a
named follow-up story and `firstRun.test.ts` continues to assert the
Python-delegation behavior unchanged.

## Validation Evidence

Pending implementation and validation. To be filled in at the Validate
checkpoint with actual CI run links/output and the parity script's redacted
report.
