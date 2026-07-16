[< CV9.E2.S7](index.md)

# CV9.E2.S7 — Test Guide

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

New coverage added with this story:

- `tests/unit/memory/storage/test_conversation_store.py` — quarantined
  conversations are excluded from `get_unextracted_conversations()`;
  `count_quarantined_conversations()` counts them.
- `tests/unit/memory/services/test_extraction_isolation.py` — failed extraction
  records an `extraction_attempts` increment and re-raises; quarantine trips at
  `EXTRACTION_MAX_ATTEMPTS` and drops the conversation from the pending set;
  `end_conversation` finalizes metadata and sets `ended_at` even when
  extraction throws.
- `tests/unit/memory/cli/test_extraction_pending_isolation.py` — `extract_pending`
  with a poisoned middle conversation extracts the other two and isolates the
  failure; `close_stale_orphans` closes every non-active orphan despite one
  failing extraction; `session_maintenance` surfaces the quarantine count.

Observed during implementation: full suite `1829 passed` (0 failed); ruff
check/format clean; mypy `111` errors, net-zero vs the pre-change baseline (all
remaining are pre-existing debt in untouched files); `git diff --check` clean.

Targeted run:

```bash
uv run pytest \
  tests/unit/memory/storage/test_conversation_store.py \
  tests/unit/memory/services/test_extraction_isolation.py \
  tests/unit/memory/cli/test_extraction_pending_isolation.py -q
```

## Manual validation route (Navigator)

The failure this story fixes is invisible by construction. This route forces a
**real, unmocked** extraction failure by running with an empty
`OPENROUTER_API_KEY` (so `send_to_model` raises), against a throwaway database,
and watches the loop isolate, quarantine, and report it.

`PI_SESSIONS_DIR` points at an empty dir so `session_maintenance()` does not
backfill real Pi sessions into the throwaway database.

```bash
TMP_HOME=$(mktemp -d); mkdir -p "$TMP_HOME/empty"
env HOME="$TMP_HOME" MIRROR_USER=smoke MEMORY_ENV=development OPENROUTER_API_KEY="" \
    MEMORY_EXTRACTION_MAX_ATTEMPTS=1 DB_PATH="$TMP_HOME/memory_dev.db" \
    PI_SESSIONS_DIR="$TMP_HOME/empty" \
    uv run python - <<'PY'
from memory import MemoryClient
from memory.config import DB_PATH
import memory.cli.conversation_logger as cl

mem = MemoryClient(db_path=DB_PATH)
for n in range(3):
    c = mem.conversations.start_conversation(interface="cli", journey="mirror")
    for i in range(4):
        mem.conversations.add_message(c.id, role="user", content=f"conv {n} msg {i}")
    mem.conversations.end_conversation(c.id, extract=False)  # ended, not yet extracted

cl._memory_client = lambda *_a, **_k: MemoryClient(db_path=DB_PATH)
print("run 1 extracted:", cl.extract_pending())  # all fail (no key) -> quarantined at MAX=1
print("run 2 extracted:", cl.extract_pending())  # quarantined -> not retried
print(cl.session_maintenance())
PY
```

Expected observations:

1. `run 1 extracted: 0` and **no traceback** — the failures are isolated, not
   propagated.
2. `run 2 extracted: 0` — the three quarantined conversations are not retried.
3. `session_maintenance()` output ends with
   `⚠ 3 conversation(s) quarantined after repeated extraction failure`.

Against a working `OPENROUTER_API_KEY`, poisoning only the middle conversation
(e.g. an oversized transcript) instead yields `run 1 extracted: 2` — the other
two survive.

Known limitation: quarantine is sticky — a conversation quarantined by a
transient outage stays quarantined until a future requeue affordance clears the
flag.
