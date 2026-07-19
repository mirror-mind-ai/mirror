[< CV9.E2.S16](index.md)

# CV9.E2.S16 — Test Guide

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

- `tests/unit/memory/intelligence/test_extraction.py`: `extract_memories`
  populates the `status` sink — `parse_failed` on malformed/non-list JSON,
  `no_signal` on a valid empty list, `ok` with a kept memory, and `dropped`
  counts when sanitize drops items; called without a sink, behavior is unchanged.
- `tests/unit/memory/services/test_extraction_status.py` (new): a real
  `_extract_and_persist` run records `extraction_status` in metadata for each
  path (`parse_failed`, `no_signal`, `ok`); an LLM exception records
  `llm_failed`, still raises, and increments attempts; a fail-then-succeed retry
  ends `ok`; `extraction_dropped` is recorded when items were dropped.
- `tests/unit/memory/cli/test_conversation_logger.py`: `session_maintenance`
  prints the `⚠ … unreadable model output` line when `parse_failed`
  conversations exist, and omits it when none do.
- Regression: the existing mocked-extraction service tests
  (`test_extraction_idempotency`, `test_extraction_isolation`, conftest's
  `mock_extract_memories`) pass **unchanged**.

## Manual validation route (Navigator)

No production data or network needed for the automated proof. To see the surface,
inspect a conversation's metadata after extraction:

```bash
uv run python -m memory inspect ...   # or read conversation metadata JSON
uv run python -m memory ...           # trigger session maintenance and read the report
```

Expect `extraction_status` present on extracted conversations and the `⚠` line
only when a conversation produced unreadable model output.
