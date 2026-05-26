[< Story](index.md)

# Test Guide — CV13.E5.S1 Operation registry and dry-run contract

## Automated checks

```bash
uv run pytest tests/unit/memory/web/test_operations.py tests/unit/memory/web/test_server.py
uv run ruff check src/memory/web tests/unit/memory/web/test_operations.py tests/unit/memory/web/test_server.py
uv run ruff format --check src/memory/web tests/unit/memory/web/test_operations.py tests/unit/memory/web/test_server.py
node --check src/memory/web/static/app.js
git diff --check
```

## Manual validation

1. Start the local web server against a disposable or non-production Mirror home.
2. Request `GET /api/operations/catalog`.
3. Confirm the response is a list of allowlisted operation definitions.
4. Confirm each operation has id, title, description, category, risk level, dry-run behavior, execution availability, and parameters.
5. Confirm no endpoint exists for executing an operation in this story.
6. Confirm no operation accepts a shell command, executable path, raw SQL, `.env` mutation, git mutation, or arbitrary script body as a parameter.

## Expected result

The catalog is visible and stable, but the web app cannot execute operations yet.
