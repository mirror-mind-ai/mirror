[< CV9.E2.S6](index.md)

# CV9.E2.S6 — Test Guide

**Status:** Final — commands verified during implementation (2026-07-12)

---

## Automated

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
```

Observed during implementation: full suite green; ruff check/format clean;
mypy at 111 errors vs 119 on the pre-change baseline (net −8, all remaining
are pre-existing debt in untouched files).

New coverage added with this story:

- `tests/unit/memory/test_config.py` — containment matrix: mirror home used
  for every environment, env-specific DB names under the home, loud
  `db_path_for_env()`/`require_db_path()` failure without home or overrides,
  `MEMORY_DIR` override without a home, `db_path_for_home()` mapping.
- `tests/unit/memory/test_client_config.py` — `MemoryClient()` raises the
  actionable hint when unconfigured.
- `tests/unit/memory/cli/test_ext_env_database.py` — ext dispatch opens the
  same env-aware database as the core.
- `tests/unit/memory/cli/test_runtime_root_state.py` — homes-root scan and
  `legacy_root_runtime_state` findings.

## Isolated smoke — no root writes

Run with a temporary HOME so production state cannot be touched:

```bash
TMP_HOME=$(mktemp -d)
env -i HOME="$TMP_HOME" PATH="$PATH" MIRROR_USER=smoke MEMORY_ENV=development \
  OPENROUTER_API_KEY="" MEMORY_DIR="" DB_PATH="" \
  uv run python -m memory runtime status
# Expected: state under $TMP_HOME/.mirror-minds/smoke/ only

find "$TMP_HOME/.mirror-minds" -maxdepth 1 -type f
# Expected: no output — the homes root contains only directories
```

Unresolvable-home refusal:

```bash
env -i HOME="$TMP_HOME" PATH="$PATH" MIRROR_USER="" MIRROR_HOME="" \
  MEMORY_DIR="" DB_PATH="" \
  uv run python -m memory journeys
# Observed: single-line "Mirror home is not configured. Set MIRROR_HOME or
# MIRROR_USER (or pass an explicit MEMORY_DIR/DB_PATH override)." on stderr,
# no traceback, exit code 2, no memory*.db created under
# $TMP_HOME/.mirror-minds/
```

## Manual validation route (Navigator)

1. In `mirror-dev` (`MIRROR_USER=vinicius-dev`, `MEMORY_ENV=development`),
   run a Mirror command and confirm new writes land in
   `~/.mirror-minds/vinicius-dev/memory_dev.db` (mtime moves) and the root
   `memory_dev.db` mtime does not.
2. Start a fresh Pi session in `mirror-dev`; confirm
   `~/.mirror-minds/vinicius-dev/mirror-logger.log` receives entries.
3. Run `uv run python -m memory runtime diagnose`; confirm it reports the
   legacy root artifacts (`memory.db`, `memory_dev.db`, `memory_test.db`,
   `mirror-logger.log`, locks, `backups/`) with the manual relocation route.

Known limitation: already-running Pi sessions keep logging to the old paths
until restarted.
