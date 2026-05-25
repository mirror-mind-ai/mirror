[< Story](index.md)

# Test Guide — CV13.E3.S3 Journey settings placement

## Automated checks

```bash
uv run pytest tests/unit/memory/surfaces/test_workspace.py tests/unit/memory/web/test_configuration.py tests/unit/memory/web/test_server.py
uv run ruff check src/memory/surfaces src/memory/web tests/unit/memory/surfaces/test_workspace.py tests/unit/memory/web/test_configuration.py tests/unit/memory/web/test_server.py
uv run ruff format --check src/memory/surfaces src/memory/web tests/unit/memory/surfaces/test_workspace.py tests/unit/memory/web/test_configuration.py tests/unit/memory/web/test_server.py
node --check src/memory/web/static/app.js
git diff --check
```

## Manual browser validation

1. Open Configuration and confirm there is no duplicated Journeys tab/list.
2. Open Workspace.
3. Select a journey.
4. Open the Workspace Settings tab.
5. Confirm journey id/status/project path/sync file/icon/color are visible.
6. Confirm the tab is read-only and has no edit controls yet.
