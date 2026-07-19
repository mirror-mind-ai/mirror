[< CV9.E2.S28](index.md)

# CV9.E2.S28 — Test Guide

## Automated (keyless, CI-safe — despite this being a "retrieval quality" story, no network call happens at test/eval time; embeddings are frozen)

```bash
# The eval module's own deterministic tests
uv run pytest tests/unit/memory/evals/test_retrieval_relevance_fixture_contract.py -v

# Structural contract, incl. the retroactive journal/title_tags fix
uv run pytest tests/unit/memory/evals/test_eval_modules.py -v

# Discovery (11 modules now)
uv run pytest tests/unit/memory/evals/test_runner.py::TestDiscoverEvalNames -v

# Full gate
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/ evals/
uv run ruff format --check src/ tests/ evals/
uv run mypy src/memory        # 109-error D-006 baseline, unaffected (no src/memory/ files touched)
git diff --check
uv run python scripts/check_doc_links.py
```

## Manual — run the actual eval (free; frozen fixture, no API key needed)

```bash
uv run python -m memory eval retrieval_relevance
```

Expected: `19/19 passed (threshold: 0.95)`, MRR≈0.9074, `q09-choose-nomad-base` showing `rr=0.333` (the deliberate old-but-relevant stress case).

## Manual — discovery includes the new module

```bash
uv run python -c "from evals.runner import discover_eval_names; print(discover_eval_names())"
```

Expected: 11 modules including `retrieval_relevance`.

## Manual — reproduce the "prove it bites" perturbation

```bash
uv run python -c "
import memory.intelligence.search as search_mod
search_mod.SEARCH_WEIGHTS = {'semantic': 0.0, 'recency': 0.55, 'reinforcement': 0.10, 'relevance': 0.10, 'lexical': 0.25}
from evals.runner import run_eval
report = run_eval('retrieval_relevance')
print(f'score={report.score:.4f} passed={report.passed}')
"
```

Expected: score collapses to ~0.32 (well below threshold). Confirms this is a throwaway in-process mutation — `git status src/memory/config.py src/memory/intelligence/search.py` shows nothing changed afterward.

## Manual — confirm no cross-eval leakage (the design's core safety property)

```bash
uv run python -m memory eval --all
```

Expected: `retrieval_relevance` reports the identical baseline (19/19, MRR 0.9074) whether run standalone or inside `--all`; `scene`/`shadow`'s own live probes run normally afterward (proving no frozen `datetime`/`generate_embedding` leaked into them). Also expected in this run: `routing` fails on the pre-existing, already-registered **D-005** debt (stale persona fixtures — unrelated to this story), and `title_tags` still shows 2 legitimate, evidence-based probe failures (`title-trivial-empty`, `tags-exclude-noise`) that are real model-behavior findings from S25's own scope, deliberately left untouched here.

## Regenerating the fixture (only on a corpus/embedding-model change — not part of normal verification)

```bash
uv run python evals/_fixtures/retrieval_relevance/generate_fixtures.py
```

Requires `OPENROUTER_API_KEY`. Overwrites `corpus.json`/`queries.json` with fresh embeddings and updated provenance. A deliberate, versioned act — same discipline as `spikes/ts-search-parity/generate_golden.py`.
