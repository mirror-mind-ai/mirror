[< Story](index.md)

# Test Guide — CV13.E5.S7 Operations surface polish and release coherence

## Automated checks

```bash
uv run pytest tests/unit/memory/web/test_operations.py tests/unit/memory/web/test_server.py tests/unit/memory/services/test_operation_runs.py tests/unit/memory/db/test_migrations.py
uv run ruff check src/memory tests/unit/memory/web/test_operations.py tests/unit/memory/web/test_server.py tests/unit/memory/services/test_operation_runs.py tests/unit/memory/db/test_migrations.py
uv run ruff format --check src/memory tests/unit/memory/web/test_operations.py tests/unit/memory/web/test_server.py tests/unit/memory/services/test_operation_runs.py tests/unit/memory/db/test_migrations.py
node --check src/memory/web/static/app.js
git diff --check
```

## Manual browser validation

1. Open `http://127.0.0.1:8765/#operations`.
2. Confirm the Operations hero explains the allowlisted/synchronous-first boundary.
3. Run Runtime health and confirm the primary result is readable as cards, not only JSON.
4. Run Database backup and confirm backup evidence is readable.
5. Run Conversation repair dry-run and confirm candidates/applied count are readable.
6. Confirm raw JSON remains available as collapsed evidence.
7. Confirm recent history is readable without opening raw JSON.
8. Confirm there is still no arbitrary command, path, SQL, restore, delete, update, job, streaming, or cancellation surface.
