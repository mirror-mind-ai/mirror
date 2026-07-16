[< CV9.E2.S11](index.md)

# CV9.E2.S11 — Test Guide

**Status:** Final — commands verified during implementation (2026-07-16)

---

## Automated

Run the suite the way CI does — **keyless** — so a config/key-dependent change
cannot pass locally and fail in CI:

```bash
uv sync --extra dev
env OPENROUTER_API_KEY="" uv run pytest tests/unit/ tests/integration/ -m "not live"
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

New coverage:

- `tests/unit/memory/services/test_search_reinforcement.py`:
  - `search_with_status(log_access=False)` calls `store.log_access` zero times;
  - the default reinforces once per returned result;
  - a TWO_PASS-enabled extraction reinforces nothing (curation opted out).
- `tests/unit/memory/mcp/test_tools.py`: `_search_memories` does not reinforce.
- `tests/unit/memory/cli/test_memories.py`: `memories --search` does not
  reinforce.

Targeted run:

```bash
uv run pytest tests/unit/memory/services/test_search_reinforcement.py \
  tests/unit/memory/mcp/test_tools.py tests/unit/memory/cli/test_memories.py -q
```

## Manual validation route (Navigator)

Confirm an agent-style search leaves `access_count` untouched while a Builder
context load reinforces:

```bash
TMP_HOME=$(mktemp -d)
env HOME="$TMP_HOME" MIRROR_USER=smoke MEMORY_ENV=development DB_PATH="$TMP_HOME/x.db" \
  uv run python - <<'PY'
import numpy as np
import memory.services.memory as m
import memory.intelligence.search as s
from memory import MemoryClient
from memory.config import DB_PATH
from memory.mcp import tools

fake = lambda text: np.ones(1536, dtype=np.float32) / np.sqrt(1536)
m.generate_embedding = fake
s.generate_embedding = fake

mem = MemoryClient(db_path=DB_PATH)
rec = mem.add_memory(title="Nomad freedom", content="digital nomad", memory_type="insight")

before = mem.store.get_access_count(rec.id)
tools._search_memories(mem, {"query": "nomad"})          # agent search — must not reinforce
after_mcp = mem.store.get_access_count(rec.id)
mem.search("nomad")                                       # default (genuine) — reinforces
after_default = mem.store.get_access_count(rec.id)

print("before:", before, "after MCP:", after_mcp, "after default:", after_default)
PY
```

Expected: `before: 0 after MCP: 0 after default: 1` — the agent search did not
reinforce; the default retrieval did.
