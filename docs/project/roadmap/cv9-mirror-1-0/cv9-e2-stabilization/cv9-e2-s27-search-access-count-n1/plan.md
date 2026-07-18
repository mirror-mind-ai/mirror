[< CV9.E2.S27](index.md)

# CV9.E2.S27 — Plan

## Problem

AI-13: `search_with_status()` fires one `get_access_count()` query per candidate memory inside the scoring loop — 1 + N round-trips per search. Not a 1.0 blocker, but a one-line-class fix that mirrors the DS5-committed TS strategy (single `GROUP BY`).

## Design

### Query collapse (database-architect)

`get_access_counts() -> dict[str, int]` — one `SELECT memory_id, COUNT(*) GROUP BY memory_id` over the full (sparse) access log. Called once before the scoring loop; `access_counts.get(mem.id, 0)` replaces `get_access_count(mem.id)` per iteration. `get_access_count` (singular) stays — still a legitimate API, used by 3 existing tests.

### Measurement discipline (ai-engineer + devops-engineer)

Split the audit's "10k latency probe" into two distinct things:
- **Deterministic, CI-gated invariant:** query/call count doesn't scale with N. Wall-clock is not this — it's flaky by nature.
- **Opt-in, informational benchmark:** actual wall-clock at 10k, reported but never gating (`tests/benchmark/`, structurally outside CI's test paths, `@pytest.mark.benchmark` registered for clarity).

## Team revisions from QA's plan

- **database-architect:** full (not filtered) `GROUP BY`; the zero-access boundary (`GROUP BY` omits rows with no log entries) is the exact case the parity test must cover.
- **ai-engineer:** query-count invariant is the CI gate; wall-clock is informational only; confirm the fix is read-only (protects AI-12's write-path integrity).
- **devops-engineer:** benchmark lives outside `tests/unit/`/`tests/integration/` so it's excluded from CI by path, no `-m` gymnastics needed; seeded corpus for reproducible numbers.
- **prompt-engineer:** recused — no instruction-text surface.

## TDD — including two mid-implementation corrections

1. Storage: `get_access_counts()` tests RED (`AttributeError`) → implement → GREEN.
2. Query-shape tests written against `search.py` (untouched): parity tests GREEN immediately (characterizing correct current behavior as the safety net); a first query-count test attempt gave RED but for a **misleading reason** — investigated via direct SQL tracing rather than assumed, found SQLite FTS5's own internal BM25 lookups scale with matching-row count (orthogonal to AI-13) — corrected by using a non-matching query term to isolate the measurement, plus adding a second, FTS5-noise-immune call-count-spy test as the primary guard.
3. A first parity-test attempt also produced a false failure: identical mocked embeddings across three test memories triggered *correct* MMR deduplication (collapsing them to one result) — not a bug, but not what the test intended to isolate. Fixed by neutralizing `MMR_DEDUP_THRESHOLD` for that test.
4. Implement the collapse in `search.py`. Re-run all: parity tests stay GREEN (no regression), both query-shape tests flip to GREEN.
5. **Sanity check:** temporarily reverted the fix (`git stash` on `search.py` alone) and confirmed both query-shape tests go genuinely RED again — not just written to pass.
6. Opt-in 10k benchmark, `benchmark` marker registered, confirmed excluded from CI's exact test command.

## Scope honesty

An index on `memory_access_log(memory_id)` is named, not built — no evidence it's needed for a full scan of a naturally sparse, single-user-local table.
