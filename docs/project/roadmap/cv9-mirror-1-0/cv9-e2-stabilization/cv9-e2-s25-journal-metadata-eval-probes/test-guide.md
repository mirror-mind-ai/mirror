[< CV9.E2.S25](index.md)

# CV9.E2.S25 — Test Guide

## Automated (keyless, CI-safe)

```bash
# AI-24 coercion tests
uv run pytest tests/unit/memory/intelligence/test_extraction.py::TestClassifyJournalEntry -q

# Discovery + structural eval contracts
uv run pytest tests/unit/memory/evals/ -q

# Full gate
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/ evals/
uv run ruff format --check src/ tests/ evals/
uv run mypy src/memory
git diff --check
```

## Manual — discovery live

```bash
uv run python -c "from evals.runner import discover_eval_names; print(discover_eval_names())"
```

Expected: 10 modules including `journal` and `title_tags`.

## Not run here (by design)

`eval title_tags` and `eval journal` hit EXTRACTION_MODEL live — they're the human release step per the S24 playbook. Their structural contracts are proven above (CI). The layer probes (n=10 pre-registered) and injection probes run only on demand.
