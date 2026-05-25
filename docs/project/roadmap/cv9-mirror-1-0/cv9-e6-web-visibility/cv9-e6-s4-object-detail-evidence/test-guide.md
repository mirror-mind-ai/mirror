[< Story](index.md)

# Test Guide — CV9.E6.S4 Object Detail and Source Context

## Automated validation

Run the focused web visibility suite:

```bash
uv run pytest tests/unit/memory/surfaces tests/unit/memory/web tests/unit/memory/test_public_api.py
uv run ruff check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
uv run ruff format --check src/memory/surfaces src/memory/web tests/unit/memory/surfaces tests/unit/memory/web
git diff --check
```

Expected coverage:

- object detail supports identity entries;
- object detail supports persona entries;
- unsupported or missing objects return honest not-found behavior;
- evidence/source empty state is explicit when provenance is missing;
- web route delegates to `MemoryClient.surfaces.object_detail(...)`;
- serialized DTOs remain JSON-safe.

## Manual validation

Start the local web server:

```bash
uv run python -m memory web
```

Then open the local web app and validate:

1. Identity Map still opens normally.
2. Clicking **Self / Alma** opens a detail view.
3. The detail view shows real `self/soul` content.
4. The public source panel says where it comes from, e.g.
   `identity/self/soul`.
5. The source panel does not imply inferred evidence when only an explicit
   identity entry exists.
6. Clicking a persona opens a persona detail view.
7. Missing or unsupported object URLs show an honest error/empty state.
8. Returning to the Identity Map is obvious.

## Acceptance note

This story is valid when users can drill down from the map into supported
objects and understand both the object and where it came from, even when deeper
provenance is not available yet.
