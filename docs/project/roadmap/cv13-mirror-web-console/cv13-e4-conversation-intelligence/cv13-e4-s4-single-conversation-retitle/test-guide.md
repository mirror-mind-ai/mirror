[< Story](index.md)

# Test Guide — CV13.E4.S4 Single conversation retitle

## Automated checks

```bash
uv run pytest tests/unit/memory/web/test_server.py tests/unit/memory/surfaces/test_workspace.py
uv run ruff check src/memory/intelligence src/memory/services src/memory/web src/memory/surfaces tests/unit/memory/web/test_server.py tests/unit/memory/surfaces/test_workspace.py
uv run ruff format --check src/memory/intelligence src/memory/services src/memory/web src/memory/surfaces tests/unit/memory/web/test_server.py tests/unit/memory/surfaces/test_workspace.py
node --check src/memory/web/static/app.js
git diff --check
```

## Manual browser validation

1. Open Workspace and open a conversation transcript.
2. Confirm no LLM request runs on page load.
3. Click “Suggest title”.
4. Confirm a suggested title appears but is not saved automatically.
5. Click “Use suggestion” and confirm it fills the title textbox.
6. Reload before saving and confirm the old title remains.
7. Repeat, use suggestion, then click “Save title”.
8. Reload and confirm the new title persists.
9. Confirm messages remain read-only and no batch operation appears.
