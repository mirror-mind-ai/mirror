[< Story](index.md)

# Test Guide — CV9.E2.S5 Backup Destination Resolution & `BACKUP_DIR` Demotion

## Unit — `resolve_backup_dir()` precedence

`tests/unit/memory/cli/test_backup.py`

- Explicit `db_backup_path` wins over both `mirror_home` and the global default.
- `mirror_home` resolves to `mirror_home / "backups"` when no explicit path.
- The global default is used only when neither an explicit path nor a
  `mirror_home` is given.

## Unit — `backup()` demotion

`tests/unit/memory/cli/test_backup.py`

- With `BACKUP_DIR` set in the environment, `backup(mirror_home=...)` still
  writes to `mirror_home / "backups"` (env is no longer consulted).
- Passing an explicit `db_backup_path` alongside `mirror_home` writes to the
  explicit path.
- Existing coverage stays green: explicit db/backup paths, WAL/SHM inclusion,
  retention cleanup, missing-database returns `None`.

## CLI — `--backup-dir` and deprecation warning

`tests/unit/memory/cli/test_backup.py`

- `python -m memory backup --backup-dir <dir>` writes the archive under `<dir>`.
- When `BACKUP_DIR` is set and `--backup-dir` is absent, `main()` prints a
  deprecation warning to stderr and the archive lands under
  `<mirror_home>/backups`.

## Regression — callers unchanged

- `tests/unit/memory/web/test_operations.py` and
  `tests/unit/memory/web/test_server.py` backup operations resolve to
  `mirror_home/backups`.
- `tests/unit/memory/cli/test_runtime.py` runtime backup resolves to
  `mirror_home/backups`.

## Gates

- `uv run ruff check src/ tests/`
- `uv run ruff format --check src/ tests/`
- `uv run pytest`
