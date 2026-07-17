[< CV9.E2.S14](index.md)

# CV9.E2.S14 — Test Guide

**Status:** Final — verified during implementation (2026-07-17)

---

## Automated

Run keyless, as CI does:

```bash
uv sync --extra dev
env OPENROUTER_API_KEY="" uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

New coverage:

- `tests/unit/memory/storage/test_llm_calls_store.py`: `get_llm_call_summary`
  groups by role and by week; unpriced (NULL-cost) rows are counted, never summed
  as `0`; `since` scopes the window; the total aggregates across buckets.
- `tests/unit/memory/cli/test_inspect_llm_calls.py`: `--summary` renders the role
  and week tables with a TOTAL line; `—` for an unpriced bucket; `--since`
  filters; no rows → the no-rows message.
- `tests/unit/memory/services/test_observability.py`: a `cost_usd` override wins
  over `compute_cost`; a `None` override falls back to `compute_cost`.
- `tests/unit/memory/cli/test_consult.py`: a consult call logs one `role=consult`
  row with the fetched cost and empty bodies (metadata mode); `off` → no row.

## Manual validation route (Navigator)

```bash
uv run python -m memory inspect llm-calls --summary
uv run python -m memory inspect llm-calls --summary --since 2026-07-01
```

Expect per-role and per-week `calls / tokens / USD`, a TOTAL line, and any
unpriced counts. Then confirm consult joins the ledger:

```bash
uv run python -m memory consult gemini lite "one word: hi"
uv run python -m memory inspect llm-calls --role consult --limit 1
```

Expect a `consult` row with its real cost and empty prompt/response.
