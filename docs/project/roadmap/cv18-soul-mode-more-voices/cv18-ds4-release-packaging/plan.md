[< Story](index.md)

# Plan — CV18.DS4 Release Packaging

## Boundary

This story packages `v0.25.0 — Soul Mode More Voices`. It should not add new product behavior except for release blockers discovered during final validation.

## Design

Release packaging follows the standard Mirror process:

1. Mark CV18 stories complete when their validation is done.
2. Create `docs/releases/v0.25.0.md`.
3. Add the release to `docs/releases/index.md`.
4. Bump package version metadata to `0.25.0`.
5. Update roadmap and worklog references.
6. Run final local validation.
7. Commit and push.
8. Verify GitHub Actions.
9. Run release doctor.
10. Promote/tag/push when ready.

## Validation Route

Local:

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live" --cov=src --cov-report=term-missing -q
uv run ruff check src tests
uv run ruff format --check src tests
git diff --check
uv run python -m memory runtime release-notes latest
uv run python -m memory runtime release-doctor --target v0.25.0
```

Remote:

```bash
gh run list --branch main --limit 3
gh run watch <run-id> --exit-status
```

Promotion:

```bash
uv run python -m memory runtime release-promote --target v0.25.0 --push
uv run python -m memory runtime release-doctor --target v0.25.0
```

## Risks

### Packaging hides behavior changes

If final validation requires behavior changes, make a separate commit with focused validation before release promotion.

### CI differs from local environment

Watch GitHub Actions after push. Do not tag or promote stable until CI is green.
