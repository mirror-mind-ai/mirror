[< CV9.E2.S12](index.md)

# CV9.E2.S12 — Test Guide

**Status:** Final — commands verified during implementation (2026-07-16)

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

New coverage in `tests/unit/memory/cli/test_runtime_model_pins.py`:

- `probe_model_pins` warns (`model_pin_unresolved`) when the extraction pin is
  absent, recommending the `MEMORY_EXTRACTION_MODEL` override;
- a catalog containing the extraction pin yields no findings;
- the embedding pin absent from the completion-only catalog does **not** warn
  (regression guard for the false positive caught in validation);
- a catalog-fetch failure (offline / no key) is inconclusive — `probe_model_pins`
  returns `()` so diagnose stays green;
- `MEMORY_EXTRACTION_MODEL` / `MEMORY_EMBEDDING_MODEL` change the effective pins
  (verified in a subprocess so config import is clean).

## Manual validation route (Navigator)

Repoint a pin to a non-existent model and confirm `runtime diagnose` warns; and
see the pins in `runtime status`:

```bash
# Status shows the effective pins:
uv run python -m memory runtime status | grep Models

# A bogus pin is flagged by diagnose (needs a real OPENROUTER_API_KEY):
MEMORY_EXTRACTION_MODEL="vendor/does-not-exist" \
  uv run python -m memory runtime diagnose | grep -A2 model_pin_unresolved
```

Expected: `runtime status` prints
`Models: extraction=google/gemini-2.5-flash-lite, embedding=openai/text-embedding-3-small`
(or your overrides); `runtime diagnose` reports a `model_pin_unresolved` finding
recommending `set MEMORY_EXTRACTION_MODEL to a current model id`. Only the
extraction pin is catalog-probed (OpenRouter's `/models` lists no embedding
models). Offline or without a key, diagnose reports no model-pin finding
(inconclusive).
