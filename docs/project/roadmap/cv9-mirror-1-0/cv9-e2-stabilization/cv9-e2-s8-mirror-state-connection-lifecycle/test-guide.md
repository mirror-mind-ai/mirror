[< CV9.E2.S8](index.md)

# CV9.E2.S8 — Test Guide

**Status:** Final — commands verified during implementation (2026-07-16)

---

## Automated

```bash
uv sync --extra dev
uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

New coverage added with this story, in
`tests/unit/memory/hooks/test_mirror_state.py` under a
`TestFreshClientPerCall` class — all three use
`side_effect=lambda: MemoryClient(db_path=db)` (a fresh client per call, the
production path) rather than a shared held client:

- `write_state` persists session state (fails on the chained-temporary version
  with `Cannot operate on a closed database`).
- the read path (`get_value`, `needs_inject`) resolves seeded state.
- a full write → `needs_inject` → `mark_injected` → `needs_inject` round-trip.

## Manual validation route (Navigator)

Reproduce the production path (fresh client per call) directly:

```bash
TMP_HOME=$(mktemp -d)
env HOME="$TMP_HOME" MIRROR_USER=smoke MEMORY_ENV=development DB_PATH="$TMP_HOME/x.db" \
  uv run python - <<'PY'
from memory import MemoryClient
from memory.config import DB_PATH
import memory.hooks.mirror_state as ms

ms._memory_client = lambda: MemoryClient(db_path=DB_PATH)  # fresh client per call
ms.write_state(True, persona="engineer", journey="mirror", session_id="s1")
print("needs_inject:", ms.needs_inject("s1"))   # True
print("journey:", ms.get_value("journey", "s1"))  # mirror
ms.mark_injected("s1")
print("after mark:", ms.needs_inject("s1"))      # False
PY
```

Expected: no traceback; `needs_inject: True`, `journey: mirror`, `after mark:
False`. Before the fix, `write_state` raises `sqlite3.ProgrammingError: Cannot
operate on a closed database`.
