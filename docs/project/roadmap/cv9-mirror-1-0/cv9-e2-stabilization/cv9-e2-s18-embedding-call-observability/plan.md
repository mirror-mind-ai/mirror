[< Story](index.md)

# Plan — CV9.E2.S18 Embedding Call Observability

## The gap

`generate_embedding` returns `np.ndarray` and throws away `response.usage`. The
ledger seam everywhere else is `build_llm_logger(store, role, conversation_id)` →
`on_llm_call(LLMResponse)`, invoked by `send_to_model`'s callers. Embeddings have
no callback and expose no usage, so they never reach `llm_calls` — even though
`cost.py` already prices the pin.

## Design

### Seam (D1)

```python
def generate_embedding(
    text: str, *, attempts: int = EMBEDDING_ATTEMPTS,
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> np.ndarray:
```

Inside the retry loop, after each `client.embeddings.create(...)` round-trip,
build a minimal `LLMResponse(model=EMBEDDING_MODEL, content="",
prompt_tokens=response.usage.prompt_tokens, completion_tokens=None,
latency_ms=..., prompt=text)` and call `on_llm_call(response)` — **per attempt**.
The callback is the existing fail-soft logger, so a logging error cannot break
the embedding path, and metadata mode already forces empty bodies.

- **Failed attempt** (empty data / `EmbeddingError` / provider error): emit an
  **unpriced** row — `prompt_tokens=None`, so `compute_cost` returns `None`. The
  summary already counts unpriced rows honestly (AI-10 principle).
- **Empty-input guard** returns before any client call → no callback → no row.
- **Response body** is always `""` (a vector is not text); the input `text`
  follows the existing `metadata`/`full` prompt policy.

### Two roles (D2 isolation)

- Ordinary calls (interactive search, add_memory, add_attachment, staging,
  consolidation): `role="embedding"`.
- The two-pass curation per-candidate searches (`conversation.py` curation loop):
  `role="embedding:curation"`.

Two-pass's full cost is then `curation` (the LLM call, already logged) +
`embedding:curation` (its searches) — separable from ordinary retrieval in
`--summary`. This is the criterion that ties the story back to its purpose.

### Call-site map

| Site | Has store? | Role | Commit |
|------|-----------|------|--------|
| `MemorySearch.search` (interactive) | yes | `embedding` | per call (single) |
| curation loop search (`conversation.py`) | yes | `embedding:curation` | batch (`commit=False`) |
| extraction staging (summary + per-memory) | yes | `embedding` | batch (`commit=False`) |
| `add_memory` / `add_attachment` | yes | `embedding` | per call |
| consolidation merge | yes | `embedding` | per call |

`conversation_id` is threaded where in scope (staging, curation); elsewhere it is
`NULL` — aggregate spend is the goal, not per-conversation embedding accounting.

### Write amplification (D3)

`log_llm_call(..., commit: bool = True)` and `build_llm_logger(..., commit=True)`
pass-through. The two loops (staging, curation) build their logger with
`commit=False` and commit once after the batch, so the hot path does not fsync
per row. Exact transaction boundary vs. `create_memory`'s own commit is resolved
in implementation.

### Indexes

`idx_llm_calls_role` and `idx_llm_calls_called_at`, added idempotently to
`db/schema.py` (new DBs) and as a migration entry in `db/migrations.py` (existing
DBs). No column change.

## Guardrails

- Observability must never break or measurably slow the path it observes.
- Log per attempt; never undercount to look clean.
- Do not build body policy for a bodiless call.
- Retention is out of scope — file the radar item, do not implement pruning here.

## Sequence

1. `log_llm_call` / `build_llm_logger` gain `commit`. (tests: single-commit batch)
2. `generate_embedding` gains `on_llm_call`, logs per attempt incl. unpriced
   failures. (tests: row shape, retry-count rows, failure unpriced, empty-input
   none, fail-soft)
3. Wire call sites with the right role + commit mode.
4. Add the two indexes (schema + migration).
5. File the retention radar item; extend the `--summary` smoke.
6. Full verification; docs; status.
