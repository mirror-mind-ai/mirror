[< Story](index.md)

# Test Guide — CV13.E1.S1 Workspace-first shell cleanup

## Automated validation

Run focused tests:

```bash
uv run pytest tests/unit/memory/web/test_preferences.py tests/unit/memory/web/test_server.py tests/unit/memory/surfaces/test_workspace.py
uv run ruff check src/memory/web src/memory/surfaces tests/unit/memory/web tests/unit/memory/surfaces
uv run ruff format --check src/memory/web src/memory/surfaces tests/unit/memory/web tests/unit/memory/surfaces
node --check src/memory/web/static/app.js
git diff --check
```

Expected result: all commands pass.

## Manual browser validation

Start the local web app:

```bash
uv run python -m memory web
```

Open:

```text
http://127.0.0.1:8765
```

Expected observations:

- with no stored default perspective, Workspace opens first;
- the main tabs appear as Workspace, Identity, Docs;
- the top-right perspective badge is absent;
- Workspace has no Tasks tab;
- Workspace has no Open tasks metric;
- switching to Identity still loads the Identity Map;
- switching to Docs still loads the docs browser.

Stop the server with `Ctrl+C`.
