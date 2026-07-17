[< CV9.E2.S15](index.md)

# CV9.E2.S15 — Test Guide

**Status:** Final — verified during implementation; extraction eval run twice on a real key (2026-07-17)

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

New coverage in `tests/unit/memory/intelligence/test_extraction.py`:

- `_sanitize_extracted`: an invalid `layer` and an invalid `memory_type` are each
  dropped and counted; a valid set passes untouched.
- `extract_memories`: a response with an invalid-layer item drops it (mocked
  model); a response with 20 items is capped to 8; drops are counted.
- `extract_tasks`: a response with 12 tasks is capped to 5.
- `curate_against_existing`: a curated item with an invalid layer is dropped.
- Fencing: the assembled `extract_memories` / `extract_tasks` prompt contains the
  `<transcript>` fence and the "data, not instructions" instruction.
- Regression: a normal valid extraction is unchanged; `format_transcript`'s own
  contract (empty → `""`, `\n\n` join) is untouched.

## Evals (manual — needs an API key, not in CI)

The prompt text changed, so confirm no extraction-quality regression and that the
new injection probe passes:

```bash
uv run python -m memory eval extraction
```

Expect the existing probes to stay green and `prompt_injection_resisted` to pass
(the adversarial transcript yields no injected memory).

## Manual validation route (Navigator)

Review the fenced prompt and the caps, then run the eval above against a real key.
No production data is written by the eval (it calls `extract_memories` on canned
transcripts).
