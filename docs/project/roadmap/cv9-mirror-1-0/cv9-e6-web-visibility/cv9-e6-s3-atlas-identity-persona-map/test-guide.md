[< Story](index.md)

# Test Guide — CV9.E6.S3 Identity Map Page

## Automated validation

Run focused Atlas/surface and web tests:

```bash
uv run pytest tests/unit/memory/surfaces tests/unit/memory/web tests/unit/memory/test_public_api.py
```

Run lint and format checks:

```bash
uv run --extra dev ruff check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
uv run --extra dev ruff format --check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
```

## Expected automated result

- Atlas surface tests pass for real identity/persona data.
- Empty/partial readiness states remain explicit.
- Existing shell, Docs, Workspace, and public API tests still pass.
- Ruff reports no lint or formatting issues.

## Manual validation route

Start the local server:

```bash
uv run python -m memory web --port 8765
```

Open:

```text
http://127.0.0.1:8765
```

Validate Atlas:

- Atlas opens as the active perspective or can be selected from the shell.
- The page reads as a map, not a sidebar/admin menu.
- Identity/Self region is populated from real Mirror identity data.
- Personas region is populated from real persona data.
- Shadow, Memories, Journeys, and Conversations show either real cards or honest
  partial/empty states.
- Cards remain read-only.
- Links are visibly prepared for detail routing but do not imply editing.
- Workspace and Docs still work after switching away from Atlas.

## Validation record

Validated on 2026-05-24:

```bash
uv run pytest tests/unit/memory/surfaces tests/unit/memory/web tests/unit/memory/test_public_api.py
uv run --extra dev ruff check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
uv run --extra dev ruff format --check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
```

Result: 35 tests passed; Ruff lint and format checks passed. Navigator browser
review accepted the Identity Map page after Self, Ego, Shadow, Personas, and
Memories refinements.

## Known exclusions

- Object detail page behavior.
- Evidence drill-down.
- Full graph interactions.
- Full Workspace dashboard design.
