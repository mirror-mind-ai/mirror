# Plan — CV22.DS4.US1

## Objective

Port the honest-reinforcement writes — `log_access` (INSERT `memory_access_log` +
UPDATE `memories.last_accessed_at`) and `log_use` (`use_count + 1`) — from the
Python core to the TS core, proven byte-for-byte against the Python oracle through
the CV22.DS4.TS1 write-parity harness under a string-injected frozen `now`. Extend
the harness to the multi-table, insert-aware snapshots this requires — which is
where the deferred WAL/multi-probe debt is paid.

## Scope

- **Harness extension (pays the deferred debt):**
  - `WriteProbe`/snapshot capture **multiple tables** and support **insert-aware**
    snapshots — rows selected by a `WHERE` clause (e.g. `memory_access_log WHERE
    memory_id = ?`), not only by known id.
  - Give each probe its own copy path (or clear `-wal`/`-shm` sidecars) so
    multi-table / multi-probe runs cannot corrupt — the deferred WAL revisit.
- **TS reinforcement module** (`ts/src/memory/reinforcement.ts`) over the writable
  seam:
  - `logAccess(db, memoryId, nowIso, context)` → INSERT
    `memory_access_log(memory_id, accessed_at = nowIso, access_context = context)`
    + UPDATE `memories SET last_accessed_at = nowIso`.
  - `logUse(db, memoryId)` → `UPDATE memories SET use_count = use_count + 1`.
- **Now-injection:** the frozen `now` is injected as the exact ISO string Python
  produces — `datetime.now(utc).isoformat().replace("+00:00", "Z")`, microsecond
  precision — so both cores write identical timestamps under the frozen clock.
- **Real Python oracle in the driver:** `write_parity.py` applies the actual
  `store.log_access` / `store.log_use` on its copy with the clock frozen
  (monkeypatch the `memories` module datetime) and records the two-table
  `python_state`.
- **Prove two-table reinforcement parity** through the harness: the mutated state
  of both `memories` and `memory_access_log` hashes identically across Python and
  TS.

## Non-Goals

- **Runtime front-door routing of the live reinforcement write** (TS writing the
  live `memory.db`) — deliberately deferred so the first live-write path is its
  own explicit step. US1 proves parity and ships the TS module; wiring it into the
  Pi front door is a follow-up. **(Navigator to confirm this boundary.)**
- Journey and identity writes (US2 / US3).
- External-API writes, memory creation, embeddings (DS5).
- Schema change — the schema is inherited; this is behavioral parity only.

## Acceptance Behavior

```text
Given a seeded memory.db copy and a frozen now (the exact ISO string)
When store.log_access(id) + store.log_use(id) run through the Python core, and
     logAccess(id)/logUse(id) run through the TS core, on parallel copies of the same seed
Then the mutated state of BOTH memories and memory_access_log is equal:
     a new memory_access_log row (same accessed_at, access_context, next id),
     memories.last_accessed_at == the frozen ISO, use_count incremented by exactly 1
And no other row or column changes in either database
```

## Validation Route

- **Automated:** harness unit tests for the multi-table / insert-aware snapshot
  plus a reinforcement probe (PASS on identical two-table state, FAIL on a
  divergent timestamp or count); full TS suite green; typecheck / biome / ruff
  clean.
- **Navigator-visible:** `uv run python ts/parity/generate_demo_memory_db.py --out
  tmp/parity/demo-memory.db`, then `uv run python ts/parity/write_parity.py
  --source-db tmp/parity/demo-memory.db` exercising the reinforcement probe →
  expect `overall_match: true`, exit 0, covering both tables.
- **E2E decision:** fixture-level demo-DB route (same posture as TS1); broader E2E
  waived. (Navigator to accept.)

## Implementation Contract

- TDD: harness-extension tests first, then the TS reinforcement module, then the
  real-oracle driver + e2e.
- Keep scoped to `CV22.DS4.US1` (harness extension + reinforcement module +
  driver); no journey/identity writes, no live-DB routing.
- Use `uv run` for Python commands and tests; commit only story-scoped files with
  descriptive English messages explaining why.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
