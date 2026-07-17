# Test Guide — CV20.DS13 Delivery Story Grammar Roadmap Support

Deterministic fixture-based unit tests are the primary evidence. The live
`uncle-vinny` path is a secondary manual check and is out of scope for CI.

## Shared Fixture

`tests/unit/memory/builder/conftest.py` provides `make_ds_roadmap(tmp_path)`:
a DS-grammar tree mirroring `uncle-vinny` — a `## Chapter N —` section, a
`| Code | Delivery Story | Status |` table, a `ds-35-*/index.md` with a 4-column
`| Code | Story | Type | Status |` candidate table, a `✅ Done` `DS-34`, and a
`legacy/cv5-learning-loop/index.md` with `**Status:** Planned`.

## Behavior Targets

```text
pull-candidates (DS grammar)  -> recommends next planned DS-NN
                              -> never a legacy/ CV
                              -> planned DS-3x as backlog
pull-candidates (CV grammar)  -> unchanged (regression)
expand (DS with table)        -> real children, first-pending recommended
expand (no table)             -> single synthetic child, children still reset
set-flow-unit delivery_story  -> scope confirmation = active DS children
roadmap position (planned DS) -> none (by design)
roadmap position (legacy)     -> excluded
```

## Focused Checks

```bash
uv run pytest tests/unit/memory/builder/test_pull_candidates.py -q
uv run pytest tests/unit/memory/builder/test_roadmap_position.py -q
uv run pytest tests/unit/memory/builder/test_lifecycle.py -q
uv run pytest tests/unit/memory/builder/test_flow_unit.py -q
uv run pytest tests/unit/memory/cli/test_build.py -q
```

## Required Automated Gates

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

## Manual Cross-Workspace Check (out of CI)

In a DS-grammar journey (e.g. `uncle-vinny`):

```bash
uv run python -m memory build pull-candidates --method ariad
# expect: recommended = next planned DS-NN, no legacy/ CV, planned DS-3x backlog
```

No evals — this story changes no LLM-in-the-loop behavior.
