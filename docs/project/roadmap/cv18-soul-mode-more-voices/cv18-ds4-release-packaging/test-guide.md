[< Story](index.md)

# Test Guide — CV18.DS4 Release Packaging

## Local Validation

Run:

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live" --cov=src --cov-report=term-missing -q
uv run ruff check src tests
uv run ruff format --check src tests
git diff --check
```

Expected:

- tests pass;
- ruff passes;
- formatting is stable;
- no whitespace errors.

## Release Notes Validation

Run:

```bash
uv run python -m memory runtime release-notes latest
uv run python -m memory runtime release-notes v0.25.0
```

Expected:

- both commands render `v0.25.0 — Soul Mode More Voices`;
- notes mention Wisdom Voice, Beauty Voice, pre-release refinements, and non-goals.

## Release Doctor

Run before promotion:

```bash
uv run python -m memory runtime release-doctor --target v0.25.0
```

Expected before tagging:

- ready with warnings only for missing tag or stable being behind.

Run after promotion:

```bash
uv run python -m memory runtime release-doctor --target v0.25.0
```

Expected after promotion:

- ready;
- tag points to HEAD;
- `origin/stable` is at HEAD.

## GitHub Actions

After push:

```bash
gh run list --branch main --limit 3
gh run watch <run-id> --exit-status
```

Expected:

- main CI is green before tagging or stable promotion.
