[< Story](index.md)

# Test Guide — CV9.E6.S1 Web Surface Foundation

## Automated validation

Run the focused unit tests for the new surface layer and existing web docs
browser:

```bash
uv run pytest tests/unit/memory/surfaces tests/unit/memory/web
```

Run lint and format checks for the changed code:

```bash
uv run --extra dev ruff check src/memory/surfaces tests/unit/memory/surfaces
uv run --extra dev ruff format --check src/memory/surfaces tests/unit/memory/surfaces
```

If implementation touches shared services or `MemoryClient`, run the related
unit tests too:

```bash
uv run pytest tests/unit/memory/services tests/unit/memory/test_public_api.py
```

## Expected automated result

- Surface unit tests pass.
- Existing web docs browser tests still pass.
- Ruff reports no lint or formatting issues for changed files.

## Manual validation route

This story is architectural foundation. Manual validation is code and contract
inspection rather than a browser smoke unless HTTP routes are added.

Inspect:

```text
src/memory/surfaces/
tests/unit/memory/surfaces/
src/memory/web/server.py
```

Confirm:

```text
web -> surfaces -> services -> storage -> db
```

Expected observations:

- `src/memory/surfaces/` exists.
- Surface DTOs are explicit and serializable.
- Atlas and Workspace surfaces return deterministic read models.
- Object detail supports at least identity/persona objects or documents a clear
  reason if the implementation narrows further.
- Evidence returns honest empty/provenance states.
- Search has a stable contract, even if it remains skeletal.
- No web route queries SQLite directly.
- No surface calls an LLM during composition.

## Known exclusions

- Full Atlas UI.
- Perspective shell.
- User-home default perspective storage.
- Workspace dashboard UI.
- Editing workflows.
- Full evidence graph.
