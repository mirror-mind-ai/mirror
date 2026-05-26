[< Story](index.md)

# Test Guide — CV13.E3.S4 Safe journey metadata edit

## Automated checks

```bash
uv run pytest tests/unit/memory/surfaces/test_workspace.py tests/unit/memory/web/test_server.py
uv run ruff check src/memory/services src/memory/surfaces src/memory/web tests/unit/memory/surfaces/test_workspace.py tests/unit/memory/web/test_server.py
uv run ruff format --check src/memory/services src/memory/surfaces src/memory/web tests/unit/memory/surfaces/test_workspace.py tests/unit/memory/web/test_server.py
node --check src/memory/web/static/app.js
git diff --check
```

## Manual browser validation

1. Open Workspace and select a journey.
2. Open Settings.
3. Edit project path, sync file, icon, and color.
4. Save and confirm the settings refresh.
5. Reload and confirm persistence.
6. Confirm there is no raw JSON/content editor.
