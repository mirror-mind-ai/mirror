[< Story](index.md)

# Test Guide — CV22.DS4.TS1

## Automated Validation

Harness self-tests, deterministic under a single frozen `now`, run in the TS suite
(`node:test`) and via the Python driver (`uv run`):

- **Matching probe → PASS.** A sample write applied through Python and TS on two
  parallel demo-DB copies yields identical mutated rows/columns; the verdict is
  `PASS`.
- **Divergent probe → FAIL.** A deliberately divergent write (e.g. a different
  value or a missing column update) is reported as `FAIL`, proving the diff is not
  a rubber stamp.
- **Non-copy target → ABORT.** Pointing the harness at the live `memory.db` path
  (or any path outside the ignored `tmp/` copy area) aborts **before** any write.
- **Backup recorded.** A backup step is recorded before any destructive apply.
- **Redaction.** Evidence contains only probe label, affected-row count, per-column
  hashes, and pass/fail — no raw ids, titles, or content.

## E2E Decision

Fixture-level (demo-DB copy) validation is the accepted route for TS1 — the harness
is itself the validation mechanism and ports no live write command. Broader E2E is
**waived** for TS1; each of US1–US3 validates its real write through this harness.

## Navigator Validation

- **Route:**
  1. `uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db`
  2. Run the write-parity harness against the demo DB.
- **Expected observation:** a redacted verdict showing `PASS` for the sample probe;
  `ABORT` when the harness is pointed at a non-copy path.
- **Pass condition:** sample probe `PASS`, divergent probe `FAIL`, non-copy target
  `ABORT` — all reproducible across runs (frozen `now`).
- **Fail condition:** any probe misreports, a non-copy target is not aborted, a
  destructive apply runs without a recorded backup, or results vary between runs.

## Validation Evidence

Pending implementation and validation.
