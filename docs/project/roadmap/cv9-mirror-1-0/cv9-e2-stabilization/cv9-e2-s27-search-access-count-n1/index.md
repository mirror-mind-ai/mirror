[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S27 — Collapse the Search Access-Count N+1 (closes AI-13)

**Status:** Done  
**Epic:** CV9.E2 Stabilization & Robustness  
**Closes:** AI Engineering Audit **AI-13** — search is O(N) with an N+1 query inside the scoring loop  
**Planned by:** quality-assurance · **Reviewed by:** database-architect, ai-engineer, devops-engineer (prompt-engineer recused — no instruction-text surface)

---

## User-Visible Outcome

`search_with_status()` scored every candidate memory with a **separate `COUNT(*)` query per memory** (`store.get_access_count(mem.id)` inside the scoring loop) to compute its reinforcement signal. A search over N memories fired **1 + N** SQLite round-trips — at a few thousand memories the per-memory queries dominate search latency.

Access counts are now fetched **once per search** via a new batched accessor (`get_access_counts()`, one `GROUP BY memory_id` query), collapsing the access-count path from **O(N) to O(1)** queries. Search results — memories, order, and scores — are byte-identical to before; only the query shape changed.

## Grounded facts (verified in source)

- The N+1: `search.py:218`, `get_access_count(mem.id)` inside `for mem in all_memories`.
- `get_access_count` (singular) is also called by 3 existing tests and is a legitimate public API — **kept**, just no longer called in the hot loop.
- **A measurement subtlety found while writing the regression test:** SQLite FTS5's own C-level internals (BM25 doc-size and segment b-tree lookups) *also* scale with the number of *matching* documents — an orthogonal, accepted SQLite cost unrelated to AI-13. An initial black-box "total query count is constant" test produced a false read (44 vs. 14, not the expected constant) until the query term was changed to one matching zero memories, isolating the measurement to the access-count path this story actually changes. A second, FTS5-noise-immune test (spying on `get_access_counts`/`get_access_count` call counts directly) was added as the more precise guard.
- **Both new regression tests were verified genuinely RED against the pre-fix code** (10 vs. 40 statements; `get_access_counts` called 0 times) by temporarily reverting the fix — not just written to pass.
- No existing benchmark harness — the 10k probe is net-new, minimal infrastructure.

## Scope

**In:**
- `get_access_counts() -> dict[str, int]` (`storage/memories.py`) — one `GROUP BY memory_id`, full (not filtered) scan of the sparse access log.
- `search_with_status` calls it once before the scoring loop; `access_counts.get(mem.id, 0)` replaces the per-memory call.
- Deterministic regression guards (CI-gated): a call-count spy (`get_access_counts` called once, `get_access_count` never, during search) and a statement-count invariant (query count constant across corpus size, isolated from FTS5's internal scaling via a non-matching query term).
- Semantic-parity characterization tests: known access-count ordering preserved, including the zero-access boundary case the `GROUP BY` collapse changes shape on (a memory absent from the dict, not an error).
- Opt-in 10k-memory wall-clock benchmark (`tests/benchmark/`, `@pytest.mark.benchmark`), structurally excluded from CI (`.github/workflows/tests.yml` runs only `tests/unit/` and `tests/integration/`) — informational, never gates.
- `benchmark` marker registered in `pyproject.toml`.

**Out (named, not built):**
- Index on `memory_access_log(memory_id)` — the new query is a full scan of a naturally sparse table; no evidence an index is needed at current or realistic local-corpus scale.
- Filtered (`WHERE memory_id IN (...)`) `GROUP BY` — rejected; full scan is simpler and the log is sparse by construction.

## Acceptance Criteria

- Semantic parity: identical memory ordering under known access-count differences, including a never-accessed memory (present in results, not dropped, not raising).
- Query-shape invariant: `get_access_counts` called exactly once per search; `get_access_count` never called during search (FTS5-noise-immune).
- Statement-count invariant: total DB statements during search constant across corpus size, isolated from FTS5's own internal scaling.
- `log_access`/`log_use` write paths and the reinforcement formula unchanged (read-only fix, protects AI-12).
- 10k benchmark passes with a generous, non-flaky bound; reports actual latency.
- Full keyless suite green; mypy D-006 baseline unchanged; ruff/format clean.

## Done Condition

- All new tests green in CI (no live LLM; embeddings mocked deterministically).
- Both regression tests confirmed genuinely RED against the pre-fix code (verified by temporary revert, not assumed).
- Benchmark confirmed excluded from the CI test command by path.
- Roadmap/audit/worklog updated; AI-13 marked closed in the audit's status stack (correct location, per the placement convention restored in CV9.E2.S26).

## As-built (implementation and verification)

Shipped close to plan, with one refinement discovered mid-implementation: the black-box query-count test as originally designed (assert total statement count is exactly invariant to corpus size) produced a false failure after the fix was correctly applied — not because the fix was wrong, but because the test's *content* made every memory match the FTS query, and SQLite FTS5's own BM25 ranking internals (`memories_fts_idx` segment lookups, `memories_fts_docsize` lookups) legitimately fire once per *matching document*, an orthogonal cost this story was never scoped to touch. Diagnosed by tracing the actual SQL statements (not guessed), then fixed by narrowing the test's query term to one matching zero memories — isolating the measurement to the access-count path. A second, more precise regression guard (spying on `get_access_counts` vs. `get_access_count` call counts directly) was added as the primary, FTS5-noise-immune contract, with the statement-count test kept as a secondary black-box confirmation.

Also required a design fix during test-writing: the first semantic-parity test attempt gave three memories identical mocked embeddings to pin semantic score equal, which correctly triggered MMR deduplication (collapsing three near-identical-vector results to one) — expected MMR behavior, but not what the test intended to isolate. Fixed by neutralizing `MMR_DEDUP_THRESHOLD` for that test only, cleanly separating "does reinforcement ordering work" from "does MMR dedup work" (already covered elsewhere).

Both fixes-during-TDD were caught by running the tests and reading the actual failure, not by assumption — consistent with the story's own discipline: a measurement bug in a regression test is exactly the kind of thing this audit thread exists to catch.

**Verification:** `get_access_counts` implemented (`storage/memories.py`); `search.py`'s scoring loop calls it once. 4 new storage tests (batched counts, never-accessed-memory omission, empty case, parity with the singular accessor) + 4 new search-layer tests (call-count spy, statement-count invariant, access-count-ordering with MMR neutralized, a narrow `reinforcement_score(0, 0, None)` sanity check) + 1 opt-in benchmark (10,000 memories, seeded deterministic embeddings, 0.132s measured locally, 30s generous bound). Full keyless suite green (1622+ tests); ruff/format clean; mypy at the 109-error D-006 baseline with zero new errors in touched files (`storage/memories.py`, `intelligence/search.py`).

## See also

- [Plan](plan.md) · [Test Guide](test-guide.md)
- [AI Engineering Audit — AI-13](../../../../ai-engineering-audit.md)
