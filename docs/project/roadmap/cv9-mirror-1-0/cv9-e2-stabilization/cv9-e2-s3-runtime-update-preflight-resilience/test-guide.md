[< Story](index.md)

# Test Guide — Runtime Update Preflight Resilience

## Automated Regression

```bash
uv run pytest tests/unit/memory/cli/test_runtime.py -q
```

Expected:

- `test_run_runtime_update_allows_update_safe_core_migration_drift` passes.
- `test_connect_read_only_recovers_wal_database_without_sidecars` passes.
- Existing runtime status, diagnosis, dry-run, update, and release tests pass.

## Focused Full Gate

```bash
uv run pytest tests/unit/memory/cli/test_runtime.py -q
uv run ruff check src/memory/cli/runtime.py tests/unit/memory/cli/test_runtime.py
uv run ruff format --check src/memory/cli/runtime.py tests/unit/memory/cli/test_runtime.py
git diff --check
```

Expected: all commands pass.

## Production Validation Route

After the fix is available in the production updater path, run from the production clone:

```bash
cd ~/mirror
uv run python -m memory runtime update
uv run python -m memory runtime status
uv run python -m memory runtime version
```

Expected:

- Initial status gate may report `update-safe preflight drift` if the old checkout sees a future core migration.
- Update creates and verifies a database backup before migrations.
- Fast-forward installs the stable target.
- Post-update status is ready.
- Version reports the new stable version.

If post-update status is not ready, treat that as a remaining updater bug rather than a successful manual workaround.
