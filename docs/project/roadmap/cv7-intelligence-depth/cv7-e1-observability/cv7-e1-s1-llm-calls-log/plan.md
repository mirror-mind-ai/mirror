[< CV7.E1 Observability](../index.md)

# CV7.E1.S1 — `llm_calls` log table + instrumentation at every existing call site

**Status:** Planned  
**Epic:** CV7.E1 — Pipeline Observability & Evals  
**Goal:** Every LLM-backed call writes a structured row; the substrate exists before any
further CV7 work begins.

---

## Context

Today there are five `chat.completions.create()` call sites in the intelligence layer:

| Call site | Module | Routes through `send_to_model()`? |
|-----------|--------|-----------------------------------|
| `extract_memories()` | `intelligence/extraction.py` | ❌ direct OpenAI client |
| `extract_tasks()` | `intelligence/extraction.py` | ❌ direct OpenAI client |
| `extract_week_plan()` | `intelligence/extraction.py` | ❌ direct OpenAI client |
| `classify_journal_entry()` | `intelligence/extraction.py` | ❌ direct OpenAI client |
| `send_to_model()` | `intelligence/llm_router.py` | ✅ is the router |

The extraction functions all bypass `send_to_model()` and instantiate an `OpenAI` client
directly. This is the design smell this story fixes: consolidate all chat calls through
the router, then instrument the router once.

Embeddings (`embeddings.py`) are excluded from this story — they are a different call
shape (no token cost, no generation id, different latency profile). They are noted for
a future story if the evals harness needs them.

---

## Design

### 1. Extend `LLMResponse` with `latency_ms` and `prompt`

`send_to_model()` already captures model, tokens, and generation id. Two fields are
missing for observability:

- `latency_ms: int | None` — wall-clock time of the API call in milliseconds
- `prompt: str | None` — the full prompt (or serialized messages) sent, for eval replay

These belong on `LLMResponse` so any caller can log or inspect them.

### 2. Route all extraction calls through `send_to_model()`

Refactor the four extraction functions to call `send_to_model()` instead of
instantiating `OpenAI` directly. This is a straight mechanical change; the only
visible difference is that callers get the response content from `response.content`
instead of `response.choices[0].message.content`.

Result: one authoritative LLM entry point for all text-generation calls.

### 3. Add optional `on_llm_call` callback to extraction functions

Each extraction function receives an optional `on_llm_call: Callable[[LLMResponse], None] | None`
keyword argument (default `None`). After calling `send_to_model()`, the function calls it if
provided:

```python
response = send_to_model(model, messages, temperature=0.3)
if on_llm_call:
    on_llm_call(response)
```

This keeps the intelligence layer storage-free. The storage decision lives in the service
layer, which already has a connection.

### 4. Service layer creates and passes the logger

In the three service call sites (`ConversationService`, `MemoryService`, `TaskService`),
check `LOG_LLM_CALLS` and construct a closure that writes to `LLMCallStore`:

```python
def _make_llm_logger(self, role: str, conversation_id: str | None = None) -> Callable | None:
    if not LOG_LLM_CALLS:
        return None
    def log(response: LLMResponse) -> None:
        self.store.log_llm_call(
            role=role,
            model=response.model,
            prompt=response.prompt or "",
            response_text=response.content,
            prompt_tokens=response.prompt_tokens,
            completion_tokens=response.completion_tokens,
            latency_ms=response.latency_ms,
            conversation_id=conversation_id,
        )
    return log
```

### 5. Schema + migration

New table `llm_calls`. Migration 006 adds it if missing.

### 6. `LLMCallStore` storage component

Follows the focused-component pattern in `src/memory/storage/`. Added to `Store` via
multiple inheritance. Single method: `log_llm_call(...)`.

---

## Schema

```sql
CREATE TABLE IF NOT EXISTS llm_calls (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,           -- 'extraction', 'task_extraction', 'journal_classification',
                                  --   'week_plan', 'consult'
    model TEXT NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    latency_ms INTEGER,
    cost_usd REAL,
    conversation_id TEXT REFERENCES conversations(id),
    session_id TEXT,
    called_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_calls_conversation ON llm_calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_llm_calls_role ON llm_calls(role);
CREATE INDEX IF NOT EXISTS idx_llm_calls_called_at ON llm_calls(called_at);
```

`session_id` has no FK — runtime sessions may be closed by the time a log is written.
`cost_usd` is nullable; actual cost requires a secondary API call (via
`fetch_generation_cost`) which is deferred to CV7.E1.S4 or later.

---

## Implementation sequence

```text
--- Refactor (in-scope, same story) ---
1.  Move ExtractedTask to models.py (alongside ExtractedMemory, ExtractedWeekItem)
2.  Extract prompts to src/memory/intelligence/prompts.py (four prompt strings, nothing else)
3.  Add _parse_json_response(raw: str) -> Any | None helper in extraction.py
4.  Replace the four duplicated markdown-strip + JSON-parse blocks with the helper

--- Substrate ---
5.  Schema: add llm_calls table + indexes to schema.py
6.  Migration 006: _migrate_create_llm_calls (idempotent, follows existing pattern)
7.  Config: add LOG_LLM_CALLS = os.getenv("MEMORY_LOG_LLM_CALLS", "") == "1"

--- Router extension ---
8.  Extend LLMResponse: add latency_ms and prompt fields
9.  Measure latency in send_to_model(): wrap the API call with time.perf_counter()
10. Capture prompt in send_to_model(): serialize messages to a compact JSON string

--- Extraction consolidation ---
11. Route all four extraction functions through send_to_model()
12. Add on_llm_call callback param to the four extraction functions

--- Storage ---
13. New module: src/memory/storage/llm_calls.py with LLMCallStore
14. Register LLMCallStore in Store (multiple inheritance)

--- Service wiring ---
15. Service layer: add _make_llm_logger() helper, wire it into extraction calls

--- Tests ---
16. Tests
```

---

## Files changed

| File | Change |
|------|--------|
| `src/memory/models.py` | Add `ExtractedTask` (moved from `extraction.py`); extend `LLMResponse` with `latency_ms`, `prompt` |
| `src/memory/intelligence/prompts.py` | New: four prompt strings extracted from `extraction.py` |
| `src/memory/intelligence/extraction.py` | Remove prompts + `ExtractedTask`; add `_parse_json_response`; route all 4 functions through `send_to_model()`; add `on_llm_call` param |
| `src/memory/intelligence/llm_router.py` | Measure latency, capture prompt in `send_to_model()` |
| `src/memory/db/schema.py` | Add `llm_calls` table + indexes |
| `src/memory/db/migrations.py` | Add migration 006 |
| `src/memory/config.py` | Add `LOG_LLM_CALLS` |
| `src/memory/storage/llm_calls.py` | New: `LLMCallStore` |
| `src/memory/storage/store.py` | Add `LLMCallStore` to multiple inheritance chain |
| `src/memory/services/conversation.py` | Wire `_make_llm_logger` into extraction calls |
| `src/memory/services/memory.py` | Wire `_make_llm_logger` into journal classification |
| `src/memory/services/tasks.py` | Wire `_make_llm_logger` into week plan extraction |
| `tests/unit/memory/intelligence/test_extraction.py` | Update mocks for `send_to_model` path; add `on_llm_call` tests; update `ExtractedTask` import path |
| `tests/unit/memory/intelligence/test_llm_router.py` | Add latency + prompt field tests |
| `tests/unit/memory/storage/test_llm_calls_store.py` | New: `LLMCallStore` contract tests |
| `tests/unit/memory/db/test_migrations.py` | Add migration 006 test |

---

## Tests

All unit tests mock LLM I/O. No real API calls. No `OPENROUTER_API_KEY` required.

**`test_extraction.py`** refactor coverage:
- `_parse_json_response()` handles clean JSON, markdown-wrapped JSON, and malformed input
- `ExtractedTask` import from `memory.models` (not `memory.intelligence.extraction`)
- Prompts imported from `memory.intelligence.prompts`

**`test_llm_router.py`** additions:
- `send_to_model()` returns `latency_ms` as a non-negative integer
- `send_to_model()` returns `prompt` as a non-empty string containing the message content
- Existing tests remain green

**`test_extraction.py`** changes:
- Mock target changes from `extraction.OpenAI` to `extraction.send_to_model` (now routed)
- `on_llm_call` is invoked once per extraction call when provided
- `on_llm_call` is not invoked when `None` (default)
- Existing extraction logic tests (output parsing) remain green

**`test_llm_calls_store.py`** (new):
- `log_llm_call()` writes a row with the correct fields
- Row is retrievable by `conversation_id`
- Row is retrievable by `role`
- `id` is a UUID string
- `called_at` is a valid ISO timestamp

**`test_migrations.py`** addition:
- Migration 006 creates `llm_calls` table on a legacy DB that lacks it
- Migration 006 is a no-op on a DB already initialized from SCHEMA

---

## Constraints

- **No API calls in unit tests.** All LLM calls are mocked.
- **`LOG_LLM_CALLS` gating is mandatory.** When the flag is off, zero rows are written and no performance cost is paid.
- **Intelligence layer stays storage-free.** No `conn`, no `Store`, no imports from `storage` inside `intelligence/`.
- **`send_to_model()` stays side-effect-free.** Logging happens in the callback; the router itself does not touch the database.
- **Migration 006 is idempotent.** Running it twice or against a fresh DB is a no-op.

---

## Done condition

- `llm_calls` table exists in `schema.py` and migration 006 creates it on legacy DBs
- `send_to_model()` returns `latency_ms` (int, ms) and `prompt` (str) on every call
- All four extraction functions route through `send_to_model()` — no direct `OpenAI` client in `extraction.py`
- All four extraction functions accept and invoke `on_llm_call` when provided
- `LLMCallStore.log_llm_call()` writes a complete row to `llm_calls`
- Service layer passes a logger closure when `LOG_LLM_CALLS=1`, passes `None` otherwise
- `MEMORY_LOG_LLM_CALLS=1 uv run python -m memory mirror load --query test` produces a row in `llm_calls` for any extraction that fires
- All unit tests pass; CI is green
- Coverage does not drop below current threshold

---

**See also:** [CV7.E1 index](../index.md) · [Principles](../../../../../product/principles.md)
