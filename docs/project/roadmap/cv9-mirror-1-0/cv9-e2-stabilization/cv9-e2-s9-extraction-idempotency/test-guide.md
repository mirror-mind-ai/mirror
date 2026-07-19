[< CV9.E2.S9](index.md)

# CV9.E2.S9 — Test Guide

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

New coverage in `tests/unit/memory/services/test_extraction_idempotency.py`:

- a partial embedding failure (fail on the third memory) persists **zero**
  memories and does not set `extracted`, while S7 still records the attempt;
- a retry after a partial failure yields exactly the successful set — **no
  duplicates** (fail attempt 1, succeed attempt 2 → 3 rows, not 5);
- `add_memory(embedding=vec)` stores the given vector without calling
  `generate_embedding`;
- a summary-embedding failure persists nothing;
- happy-path regression: normal extraction stores all memories and marks
  `extracted`.

Targeted run:

```bash
uv run pytest tests/unit/memory/services/test_extraction_idempotency.py -q
```

## Manual validation route (Navigator)

Reproduce the partial failure against a throwaway database with a fake embedding
provider that fails on one memory, then confirm the retry does not duplicate:

```bash
TMP_HOME=$(mktemp -d)
env HOME="$TMP_HOME" MIRROR_USER=smoke MEMORY_ENV=development DB_PATH="$TMP_HOME/x.db" \
  uv run python - <<'PY'
import numpy as np
import memory.services.conversation as c
import memory.services.memory as m
from memory import MemoryClient
from memory.config import DB_PATH
from memory.models import ExtractedMemory

UNIT = np.ones(1536, dtype=np.float32) / np.sqrt(1536)
state = {"fail_third": True}

def fake_embed(text):
    if "FAIL_EMB" in text and state["fail_third"]:
        raise RuntimeError("embedding provider down")
    return UNIT

c.generate_embedding = fake_embed
m.generate_embedding = fake_embed
c.extract_memories = lambda *a, **k: [
    ExtractedMemory(title=f"mem{i}", content=("FAIL_EMB" if i == 2 else f"c{i}"),
                    memory_type="insight", layer="ego")
    for i in range(3)
]
c.extract_tasks = lambda *a, **k: []

mem = MemoryClient(db_path=DB_PATH)
conv = mem.conversations.start_conversation(interface="cli", journey="mirror")
for i in range(4):
    mem.conversations.add_message(conv.id, role="user", content=f"msg {i}")

def count():
    return mem.store.conn.execute(
        "SELECT COUNT(*) FROM memories WHERE conversation_id = ?", (conv.id,)
    ).fetchone()[0]

try:
    mem.conversations.extract_conversation(conv.id)
except Exception as e:
    print("attempt 1 raised:", type(e).__name__)
print("memories after failed attempt:", count())   # 0
state["fail_third"] = False
mem.conversations.extract_conversation(conv.id)
print("memories after retry:", count())             # 3, no duplicates
PY
```

Expected: `attempt 1 raised: RuntimeError`, `memories after failed attempt: 0`,
`memories after retry: 3`. Before the fix, the failed attempt leaves 2 memories
and the retry brings the total to 5.
