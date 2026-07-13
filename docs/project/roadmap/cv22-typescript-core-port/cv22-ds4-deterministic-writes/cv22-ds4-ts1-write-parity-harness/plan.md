# Plan — CV22.DS4.TS1

## Objective

Deliver a reusable, backup-gated, copy-only **write**-parity harness — the write
counterpart to the DS2.TS3 read harness — that proves a write applied through the
TS core mutates `memory.db` identically to the Python oracle, under a frozen
`now`, emitting redacted evidence by default. This is the safety foundation every
DS4 write port (US1–US3) is proven against; no user-facing write command is ported
here.

## Scope

- **Write-parity route.** Take an explicit source DB (default: the portable demo
  DB from `ts/parity/generate_demo_memory_db.py`), make **two** parallel copies in
  ignored `tmp/parity/` storage, apply the same registered write probe to each —
  Python oracle on copy A, TS core on copy B — then state-diff the mutated
  rows/columns for equality.
- **Frozen-`now` write seam.** Inject one frozen `now` into both implementations
  so timestamp-stamping writes (e.g. `last_accessed_at`) are comparable — the
  write analogue of DS2's frozen-`now` read contract.
- **Backup gate + copy-only guard.** Refuse to run against anything but a copy:
  resolve the target path and abort if it is the live `memory.db` (or outside the
  ignored `tmp/` area); record a backup step before any destructive apply.
- **Redacted evidence by default.** Emit an ordered verdict — probe label,
  affected-row count, per-column hashes, pass/fail — never raw ids, titles, or
  content. Same privacy posture as DS2.TS3.
- **Probe registry.** A small registry so US1–US3 register their write families
  (`log_access`/`increment_use_count`, journey writes, identity writes) against
  this one harness.

## Non-Goals

- Porting any specific write command — `log_access` is US1; journey/identity are
  US2/US3.
- External-API writes — extraction, embeddings, consult (CV22.DS5).
- Any schema or FTS5 change.
- Proving parity against the live production database — copy-only, always.

## Acceptance Behavior

```text
Given the portable demo memory.db as the seed source
When the harness runs a sample write probe through the Python oracle and the TS core
     on two parallel copies under a single frozen now
Then it emits an ordered, redacted state-diff verdict reporting PASS (mutated rows/columns equal)
And a deliberately divergent probe reports FAIL
And pointing the harness at a non-copy (the live memory.db path) ABORTS before any write
And a backup is recorded before any destructive apply
```

## Validation Route

- **Automated:** harness self-tests — matching probe → PASS, divergent probe →
  FAIL, non-copy target → ABORT — deterministic under the frozen `now`, run in the
  TS suite (`node:test`) and via the Python driver with `uv run`.
- **Navigator-visible:** `uv run python ts/parity/generate_demo_memory_db.py --out
  tmp/parity/demo-memory.db`, then run the write-parity harness against it; expect
  a redacted `PASS` verdict for the sample probe and `ABORT` when pointed at a
  non-copy path.
- **E2E decision:** fixture-level (demo-DB copy) validation is the accepted route
  for TS1 — the harness *is* the validation mechanism and touches no live write
  command yet. Proposing to **waive** broader E2E for TS1; US1–US3 each validate
  their real write through this harness. (Navigator to accept the narrower route.)

## Implementation Contract

- TDD: write the failing harness tests first (divergent → FAIL, matching → PASS,
  non-copy → ABORT), then implement to green.
- Keep changes scoped to `CV22.DS4.TS1` (the `ts/parity/` write harness + its
  tests); do not port a real write command.
- Use `uv run` for Python commands and tests.
- Do not use `git add .`; commit only story-scoped files.
- Use descriptive English commit messages explaining why.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
