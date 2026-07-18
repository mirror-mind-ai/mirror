[< CV9.E2.S26](index.md)

# CV9.E2.S26 — Test Guide

## Automated (keyless, CI-safe — the whole pipeline is mocked, per AI-02's existing isolation-test pattern)

```bash
# Storage layer: limit/ordering/quarantine-exclusion + the new count method
uv run pytest tests/unit/memory/storage/test_conversation_store.py -q

# CLI layer: cap, drain-over-runs, config override, oldest-first wiring,
# carried-over report line, word-collision guard
uv run pytest tests/unit/memory/cli/test_extraction_pending_isolation.py -q

# Full gate
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/ evals/
uv run ruff format --check src/ tests/ evals/
uv run mypy src/memory        # 109-error D-006 baseline; touched files clean
git diff --check
uv run python scripts/check_doc_links.py
```

## Manual — the cap is live

```bash
uv run python -c "from memory.config import MEMORY_MAINTENANCE_MAX_EXTRACTIONS; print(MEMORY_MAINTENANCE_MAX_EXTRACTIONS)"
```

Expected: `10`.

```bash
MEMORY_MAINTENANCE_MAX_EXTRACTIONS=3 uv run python -c "from memory.config import MEMORY_MAINTENANCE_MAX_EXTRACTIONS; print(MEMORY_MAINTENANCE_MAX_EXTRACTIONS)"
```

Expected: `3`.

## Manual — the report wording

```bash
grep -n "carried over" src/memory/cli/conversation_logger.py
```

Expected: the report line, worded "carried over" — never "skipped" (AI-21's vocabulary) or "deferred" (`session_start_fast`'s vocabulary).

## Manual — audit document coherence (the placement bug found in-cycle)

```bash
tail -5 docs/project/ai-engineering-audit.md
```

Expected: the file ends at the "**See also:**" line — nothing appended after it.

## Not run here (by design)

A real end-to-end backlog drain (15+ real conversations, real LLM extraction) is not exercised live — it costs money and is exactly the AI-02 isolation-test shape already proven reliable (`_patch_pipeline` mocks embeddings/extraction deterministically). The keyless tests above exercise the identical code path with a mocked pipeline, including the actual SQL `ORDER BY`/`LIMIT` against a real SQLite connection (not mocked at the storage layer).
