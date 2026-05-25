[< Story](index.md)

# Test Guide — CV13.E3.S2 Environment boundary and secrets masking

## Automated checks

```bash
uv run pytest tests/unit/memory/web/test_configuration.py tests/unit/memory/web/test_server.py
uv run ruff check src/memory/web tests/unit/memory/web/test_configuration.py tests/unit/memory/web/test_server.py
uv run ruff format --check src/memory/web tests/unit/memory/web/test_configuration.py tests/unit/memory/web/test_server.py
node --check src/memory/web/static/app.js
git diff --check
```

## Manual browser validation

1. Open Configuration.
2. Confirm an Environment boundary section appears.
3. Confirm safe settings show values or configured/missing state.
4. Confirm secrets/API keys are masked and not fully visible.
5. Confirm the page remains read-only and does not offer `.env` editing.
