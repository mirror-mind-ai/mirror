[< Story](index.md)

# Plan — CV9.E2.S5 Backup Destination Resolution & `BACKUP_DIR` Demotion

## Problem

Destination resolution lived inside `backup()` as a nested conditional that read
`os.environ["BACKUP_DIR"]` and `config.BACKUP_DIR`. This coupled a filesystem
policy decision to hidden global state, making it untestable without env
manipulation, surprising (global env beats explicit `mirror_home`), and
multi-user-unsafe (one global folder, colliding filenames).

## Design

### Tier 1 — Functional core

Extract a pure resolver:

```python
def resolve_backup_dir(*, db_backup_path, mirror_home, default_backup_path):
    if db_backup_path is not None:      # explicit per-invocation choice wins
        return db_backup_path
    if mirror_home is not None:          # scoped default: back up where the mirror lives
        return mirror_home / "backups"
    return default_backup_path           # global fallback (no mirror scope)
```

`backup()` computes `default_backup_path` from `_default_paths()` only when no
`mirror_home` is given, then delegates the destination decision to
`resolve_backup_dir()`. `backup()` no longer imports or reads `BACKUP_DIR`.

### Tier 2 — Demote `BACKUP_DIR`

Redirection becomes an explicit CLI concern, not a hidden global:

- `python -m memory backup` gains `--backup-dir <path>`; when provided it is
  expanded and passed as the explicit `db_backup_path`.
- When `BACKUP_DIR` is set in the environment and no `--backup-dir` is given,
  `main()` prints a deprecation warning to stderr and passes no explicit
  destination, so the backup lands in `<mirror_home>/backups`.
- The `config.BACKUP_DIR` constant is removed; `main()` detects the deprecated
  env directly with `os.environ.get("BACKUP_DIR")`.

The warning path exists only in the CLI. Web and runtime callers pass
`mirror_home` and always resolve to `mirror_home/backups`, which is already the
behavior their tests and the web config surface assume.

## Trade-offs

- **Deliberate behavior change.** Existing setups relying on `BACKUP_DIR` to
  redirect the CLI backup will now write under the mirror home until they adopt
  `--backup-dir`. This is intentional and made non-silent by the warning; the
  decision is recorded in [Decisions](../../../../decisions.md).
- **`DB_BACKUP_PATH` retained.** It remains the global default for the
  no-`mirror_home` fallback, so nothing breaks for callers without a mirror
  scope.
- **No filename namespacing.** Cross-user collisions in a shared directory are
  left as a future note; with the demote, the common single-user path no longer
  shares a global directory by default.

## Verification

- Pure unit tests for `resolve_backup_dir()` covering each precedence tier.
- `backup()` ignores `BACKUP_DIR` even when set, resolving to `mirror_home/backups`.
- CLI `--backup-dir` redirects intentionally.
- CLI emits the deprecation warning when `BACKUP_DIR` is set without the flag,
  and still writes under the mirror home.
- Existing backup, web operation, and runtime backup tests stay green.
