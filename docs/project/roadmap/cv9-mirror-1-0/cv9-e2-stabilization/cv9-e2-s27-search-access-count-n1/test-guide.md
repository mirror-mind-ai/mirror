[< CV9.E2.S27](index.md)

# CV9.E2.S27 — Test Guide

## Automated (keyless, CI-safe)

```bash
# Storage: the batched accessor
uv run pytest tests/unit/memory/storage/test_store.py::TestAccessCounts -q

# Search: parity + the two query-shape regression guards
uv run pytest tests/unit/memory/services/test_search_reinforcement.py -q

# Full gate
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/ evals/
uv run ruff format --check src/ tests/ evals/
uv run mypy src/memory        # 109-error D-006 baseline; touched files clean
git diff --check
uv run python scripts/check_doc_links.py
```

## Manual — confirm the regression guards are real (not vacuous)

```bash
git stash push src/memory/intelligence/search.py
uv run pytest tests/unit/memory/services/test_search_reinforcement.py::TestSearchQueryCount -v
git stash pop
```

Expected: both tests **FAIL** with the fix reverted (`get_access_counts` called 0 times; statement count scales, e.g. 10 vs. 40), then **PASS** again after `git stash pop`.

## Manual — the opt-in benchmark

```bash
uv run pytest tests/benchmark/ -v -s
```

Expected: prints `[benchmark] search_with_status over 10000 memories: <N>s`, passes under the generous 30s bound. Locally measured: ~0.13s.

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live" --collect-only -q | grep -c benchmark
```

Expected: `0` — confirms the benchmark is structurally excluded from the same command CI runs (`.github/workflows/tests.yml`).

## Not run here (by design)

Nothing in this story is live/model-backed — embeddings are mocked deterministically throughout, including in the 10k benchmark (seeded `numpy` vectors, no API calls, no cost).
