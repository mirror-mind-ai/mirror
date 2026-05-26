[< Story](index.md)

# Test Guide — CV13.E4.S6 Journey attachments visibility

## Automated checks

```bash
uv run pytest tests/unit/memory/surfaces/test_workspace.py tests/unit/memory/web/test_server.py
uv run ruff check src/memory/services src/memory/surfaces src/memory/web tests/unit/memory/surfaces/test_workspace.py tests/unit/memory/web/test_server.py
uv run ruff format --check src/memory/services src/memory/surfaces src/memory/web tests/unit/memory/surfaces/test_workspace.py tests/unit/memory/web/test_server.py
node --check src/memory/web/static/app.js
git diff --check
```

## Manual browser validation

1. Open Workspace and select a journey with attachments.
2. Confirm the selected journey metrics include Attachments.
3. Open the Attachments tab.
4. Confirm attachment cards show name, type, journey, tags when present, and description/preview.
5. Confirm the tab is read-only: no upload, edit, delete, or LLM action.
6. Select a journey without attachments and confirm the empty state is clear.
