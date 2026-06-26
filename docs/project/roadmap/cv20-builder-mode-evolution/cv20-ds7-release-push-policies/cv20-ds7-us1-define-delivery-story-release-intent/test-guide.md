[< Story](index.md)

# Test Guide — CV20.DS7.US1

## Automated Validation

Run focused checks for any changed Builder release intent model, rendering, storage, or CLI route.

Expected focused validation if runtime/CLI changes:

```bash
uv run pytest tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff check src/memory tests/unit/memory
uv run ruff format --check src/memory tests/unit/memory
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

If implementation is documentation-only after discovery, run `git diff --check` and record why no runtime tests apply.

## E2E Decision

Browser/UI E2E is not required. The observable surface is Builder CLI/Pi behavior.

## Navigator Validation

Validate three DS-level release intent states:

1. **Planned release intent**

Expected observation:

- Builder records or displays release intent as planned for the active Delivery Story.
- Builder explains that the DS may produce a release boundary.
- Builder states that no push or release action is authorized by the intent.

Pass condition: planned intent is visible and non-authorizing.

Fail condition: Builder treats release intent as approval to push, tag, promote stable, or publish a release.

2. **No release intent**

Expected observation:

- Builder records or displays release intent as none for the active Delivery Story.
- Builder can distinguish `none` from missing/unknown intent.

Pass condition: no-release intent is explicit and non-authorizing.

Fail condition: Builder later infers release approval or cannot distinguish no-release from undecided.

3. **Undecided release intent**

Expected observation:

- Builder records or displays release intent as undecided for the active Delivery Story.
- Builder can keep delivery moving without forcing a release decision.

Pass condition: undecided intent is explicit and can be revisited later.

Fail condition: Builder forces release planning or silently treats undecided as planned/no-release.

## Validation Evidence

Pending implementation and validation.
