[< CV9.E2.S10](index.md)

# CV9.E2.S10 — Test Guide

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

New coverage:

- `tests/unit/memory/services/test_search_degradation.py`:
  - an embedding failure yields `degraded=True` with only FTS-matched results;
  - `search()` (legacy) returns results instead of raising when the embedding
    fails;
  - normal mode is `degraded=False` with the semantic ranking unchanged;
  - `generate_embedding` raises `RuntimeError` on an empty API key.
- `tests/unit/memory/cli/test_memories.py`: `memories --search` prints the
  degraded marker when the query embedding fails, and still lists the FTS match.

Targeted run:

```bash
uv run pytest tests/unit/memory/services/test_search_degradation.py \
  tests/unit/memory/cli/test_memories.py -q
```

## Manual validation route (Navigator)

Force the offline path with an empty API key against a throwaway database:

```bash
TMP_HOME=$(mktemp -d)
env HOME="$TMP_HOME" MIRROR_USER=smoke MEMORY_ENV=development \
    OPENROUTER_API_KEY="" DB_PATH="$TMP_HOME/x.db" \
  uv run python - <<'PY'
import numpy as np
import memory.services.memory as m
from memory import MemoryClient
from memory.config import DB_PATH

# Seed with a working (fake) embedding so memories have vectors.
m.generate_embedding = lambda text: np.ones(1536, dtype=np.float32) / np.sqrt(1536)
mem = MemoryClient(db_path=DB_PATH)
mem.add_memory(title="Nomad freedom", content="digital nomad lifestyle",
               memory_type="insight", journey="mirror")
mem.add_memory(title="Pasta recipe", content="italian cooking", memory_type="insight")

# Real query embedding path: no API key -> no-key guard -> degraded fallback.
outcome = mem.search_with_status("nomad")
print("degraded:", outcome.degraded)
print("results:", [r.memory.title for r in outcome.results])
PY
```

Expected: `degraded: True` and `results: ['Nomad freedom']` (the FTS match
only) — no traceback. Then run `uv run python -m memory memories --search nomad`
against a real mirror home with no network to see the `⚠ Degraded` line.
