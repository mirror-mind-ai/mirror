[< CV9.E3.S16](index.md)

# Test Guide — CV9.E3.S16 Stable Promotion Execution Path

## Targeted Automated Validation

```bash
PYTHONPATH=src uv run pytest tests/unit/memory/cli/test_runtime.py -q
uv run --extra dev ruff check src/ tests/
uv run --extra dev ruff format --check src/ tests/
uv run --extra dev mypy src/memory/cli/runtime.py
git diff --check
```

Expected result: all commands pass.

## Manual Dry-Run Smoke

Use the dev clone only:

```bash
cd ~/Code/mirror-dev
uv run python -m memory runtime release-promote --target v0.9.0 --dry-run || true
```

Expected result before `v0.9.0` exists: command prints doctor failures and does not mutate tags or branches.

## Non-Mutation Check for Dry-Run

```bash
git status --short
git tag --list 'v0.9.0'
git rev-parse stable 2>/dev/null || true
uv run python -m memory runtime release-promote --target v0.9.0 --dry-run || true
git status --short
git tag --list 'v0.9.0'
git rev-parse stable 2>/dev/null || true
```

Expected result: dry-run does not create tags, move branches, or edit files.

## Production Boundary

Do not run mutating release promotion against the real stable channel unless a release candidate has been prepared and the Navigator explicitly asks for release publication.
