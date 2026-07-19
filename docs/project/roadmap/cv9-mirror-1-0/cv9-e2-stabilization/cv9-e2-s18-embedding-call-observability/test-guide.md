[< Story](index.md)

# Test Guide — CV9.E2.S18 Embedding Call Observability

All unit-level; no live API (mock the embeddings response to carry
`.usage.prompt_tokens`).

## `generate_embedding` logging

- **Success logs one row** — role `embedding`, model, `prompt_tokens`, computed
  `cost_usd`, empty body (metadata mode).
- **Per attempt** — a transient empty-data response that retries then succeeds
  logs **two** rows (one per round-trip), not one.
- **Failure is unpriced** — retry exhaustion / provider error logs a row with
  `prompt_tokens=None` and `cost_usd=None`, and still raises `EmbeddingError`.
- **Empty input logs nothing** — the S17 guard returns before any client call, so
  `on_llm_call` is never invoked.
- **Fail-soft** — when `log_llm_call` raises, `generate_embedding` still returns
  the vector (the logger swallows it; the pipeline is unbroken).
- **No callback** — `on_llm_call=None` behaves exactly as today (no row, vector
  returned).

## Roles / isolation

- Ordinary `add_memory` / search embeddings log `role="embedding"`.
- The two-pass curation loop's per-candidate searches log
  `role="embedding:curation"`, so `get_llm_call_summary` reports the two slices
  separately.

## Commit control (write amplification)

- `log_llm_call(..., commit=False)` inserts without committing; a later explicit
  commit persists the batch.
- A staging/curation batch produces one commit, not one per row (assert via a
  spy/counter on the connection's `commit`).

## Indexes

- After migration, `idx_llm_calls_role` and `idx_llm_calls_called_at` exist
  (`PRAGMA index_list(llm_calls)` / query `sqlite_master`).
- `inspect core-migrations` reports the new migration applied.

## Full verification

```bash
uv run pytest tests/unit/ tests/integration/ -m "not live" -q   # raise ulimit -n on stock macOS (D-004)
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
git diff --check
```

## Manual validation route

```bash
# after some real conversations (or a seeded batch):
uv run python -m memory inspect llm-calls --summary
```

Expected: `embedding` and `embedding:curation` rows in the by-role table, with
token counts and estimated cost — two-pass's embedding spend now visible and
separable. Unpriced failures appear in the honest `unpriced` count, not as `$0`.
