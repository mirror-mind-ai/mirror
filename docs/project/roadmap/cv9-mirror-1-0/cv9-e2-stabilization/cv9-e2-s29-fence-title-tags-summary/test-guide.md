[< CV9.E2.S29](index.md)

# CV9.E2.S29 — Test Guide

## Automated (keyless, CI-safe — fence/sandwich/worked-example presence, no live model call)

```bash
uv run pytest tests/unit/memory/intelligence/test_extraction.py -k "Fencing or Summary" -v

# Structural contract + discovery (12 modules now)
uv run pytest tests/unit/memory/evals/test_eval_modules.py tests/unit/memory/evals/test_runner.py -v

# Full gate
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/ evals/
uv run ruff format --check src/ tests/ evals/
uv run mypy src/memory        # 109-error D-006 baseline; stash-verify since src/memory/ was touched
git diff --check
uv run python scripts/check_doc_links.py
```

## Manual — the live injection probes (costs a few cents each)

```bash
uv run python -m memory eval title_tags
uv run python -m memory eval conversation_summary
```

Expected: `title-injection-resisted` and `tags-injection-resisted` green (measured 10/10 at authoring time); `summary-injection-resisted` green most runs (measured 8/10 — a documented residual, D-009, not a hard guarantee). `title-trivial-empty` and `tags-exclude-noise` stay red — pre-existing, unrelated S25 findings.

## Manual — reproduce the n=10 measurement

```bash
for i in $(seq 1 10); do uv run python -m memory eval title_tags 2>&1 | grep "title-injection-resisted\|tags-injection-resisted"; done
for i in $(seq 1 10); do uv run python -m memory eval conversation_summary 2>&1 | grep "✓\|✗"; done
```

## Manual — confirm no cross-suite regression

```bash
uv run python -m memory eval --all
```

Expected: 11/12 evals pass; the one failure is `routing` (pre-existing D-005, unrelated).

## Manual — verify the actual prompt structure (rules out an implementation bug, the first diagnostic step this story used)

```bash
uv run python -c "
from memory.intelligence.extraction import generate_conversation_title, CONVERSATION_TITLE_PROMPT
from memory.intelligence.prompts import CONVERSATION_TAGS_PROMPT, CONVERSATION_SUMMARY_PROMPT
print('WRONG:' in CONVERSATION_TITLE_PROMPT.upper() or 'wrong:' in CONVERSATION_TITLE_PROMPT.lower())
"
```

Expected: `True` — the worked counter-example is present in the committed prompt.

## Not run here (by design)

Widening `evals/_support.py`'s `DISTANCING_MARKERS` (D-009) is explicitly out of scope for this test guide — it requires a dedicated re-measurement across all four consumers (scene, shadow, title_tags, conversation_summary), not a local check here.
