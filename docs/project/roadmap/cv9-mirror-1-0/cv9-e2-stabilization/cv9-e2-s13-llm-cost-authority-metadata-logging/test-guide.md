[< CV9.E2.S13](index.md)

# CV9.E2.S13 — Test Guide

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

- `tests/unit/memory/intelligence/test_cost.py`: known model → expected USD;
  unknown model → `None`; missing/partial token usage → `None`; embedding price
  (completion `0.0`) computes correctly.
- `tests/unit/memory/services/test_observability.py`: metadata mode → bodies
  stored as `''` with cost populated; `full` → bodies present; `off` → factory
  returns `None`; **fail-soft** — `store.log_llm_call` raising does not
  propagate.
- `tests/unit/memory/test_config_log_mode.py` (subprocess for a clean config
  import): unset → `metadata`; `0` → `off`; `1` → `full`; `metadata`/`full` map
  through.
- Integration: an extraction run with a mocked LLM under default env asserts
  rows land with **empty** prompt/response and **non-null** cost; a
  content-returning model still leaves bodies empty in metadata mode (the
  privacy regression guard).

## Manual validation route (Navigator)

With no env override (the new default), hold a short conversation, then:

```bash
uv run python -m memory inspect llm-calls --limit 5
```

Expected: rows show role/model/tokens/latency and an **estimated cost**, with
`prompt`/`response` empty. Confirm opt-out and full mode:

```bash
MEMORY_LOG_LLM_CALLS=off  uv run python -m memory inspect llm-calls --limit 1   # no new rows
MEMORY_LOG_LLM_CALLS=full uv run python -m memory inspect llm-calls --limit 1   # bodies present
```
