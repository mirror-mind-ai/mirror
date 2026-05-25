[< Story](index.md)

# Test Guide — CV13.E2.S1 Mirror selector foundation

## Automated checks

```bash
uv run pytest tests/unit/memory/web/test_mirrors.py tests/unit/memory/web/test_server.py
uv run ruff check src/memory/web tests/unit/memory/web/test_mirrors.py tests/unit/memory/web/test_server.py
uv run ruff format --check src/memory/web tests/unit/memory/web/test_mirrors.py tests/unit/memory/web/test_server.py
node --check src/memory/web/static/app.js
git diff --check
```

## Manual browser validation

1. Start the local web server against the current Mirror.
2. Confirm the header still shows the active Mirror name.
3. Open the Mirror selector foundation.
4. Confirm the current Mirror is marked as active.
5. Confirm sibling local Mirrors are listed when present.
6. Confirm the selector says switching arrives in the next story and does not navigate or mutate state.
