[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S18 — Embedding Call Observability

**Status:** Done
**Epic:** CV9.E2 Stabilization & Robustness
**Closes:** debt **D-003** (embedding calls bypass the `llm_calls` ledger) — the
last dark hot-path model call, completing the **AI-09** observability arc.
**Planned by:** quality-assurance · **Reviewed by:** ai-engineer, database-architect

---

## User-Visible Outcome

Every embedding the mirror generates is recorded in the `llm_calls` ledger, so
`inspect llm-calls --summary` shows embedding spend — including the per-candidate
searches the two-pass curation pass makes. This turns the two-pass revisit trigger
in the AI-20 decision from "deferred on vibes" into "decidable with a number," and
gives AI-05 the per-conversation figures it needs to set a maintenance budget.

Today `generate_embedding` returns a raw vector and discards the response's token
usage; embeddings are the one model call on the hot path with no ledger row.

## Acceptance Criteria

- Every embedding **API round-trip** lands a `llm_calls` row: `role="embedding"`
  (ordinary) or `role="embedding:curation"` (two-pass searches), model,
  `prompt_tokens`, estimated `cost_usd` from the existing cost authority.
- `inspect llm-calls --summary` shows the embedding buckets; two-pass's embedding
  slice is separable from ordinary retrieval.
- **Per attempt, not per success** — S1's retries and failed calls are real spend
  and must not be silently undercounted. A failed call logs an **unpriced** row
  (`prompt_tokens`/`cost_usd` NULL), never a vanished call.
- Metadata-only by default (honors `MEMORY_LOG_LLM_CALLS=off|metadata|full`); the
  response body is always empty (a vector is not text).
- **Fail-soft**: a ledger or pricing error never breaks the embedding path — the
  crash-safety rule S1 and S17 established.
- The empty-input guard (S17) writes **no** row (no API call happened).
- No change to search or extraction results.

## Design Decisions (confirmed)

- **D1 — seam.** `generate_embedding(text, *, on_llm_call=None)` captures
  `response.usage.prompt_tokens`, builds an embedding `LLMResponse`, and invokes
  the callback **once per attempt**. Callers build the callback with
  `build_llm_logger(store, role=..., ...)`.
- **D2 — cost fidelity.** Per-attempt logging; failed calls are unpriced rows.
- **D3 — write amplification.** `log_llm_call` gains `commit: bool = True`; the
  batch loops (extraction staging, the curation per-candidate loop) log with
  `commit=False` and commit once, instead of an fsync per row on the hot path.
- **Indexes in-scope; retention on radar.** Add `idx_llm_calls_role` and
  `idx_llm_calls_called_at` (the summary does `GROUP BY role` and
  `strftime(called_at)` against a currently **unindexed** table). File a retention
  radar item — embeddings make `llm_calls` the fastest-growing table, and 1.0
  should decide pruning/rollup later.

## Scope

In: the seam, the two roles, per-attempt + unpriced-failure logging, the `commit`
control, the two indexes (idempotent `CREATE INDEX IF NOT EXISTS` in schema + a
migration for existing DBs), and logging at all embedding call sites (search,
add_memory, add_attachment, staging, consolidation, curation loop).

Out: retention/pruning policy (radar item); no new `llm_calls` columns; no change
to the two-pass default (that decision follows once this makes its cost visible).

## Done Condition

- Embedding calls are logged per attempt with the two roles, metadata-only,
  fail-soft; failed calls are unpriced rows; empty-input logs nothing.
- `log_llm_call` supports single-commit batches; the two indexes exist.
- `inspect llm-calls --summary` shows embedding and embedding:curation spend.
- Retention radar item filed.
- Unit tests cover the edge matrix (retry, failure, empty-input, degraded,
  metadata-only, fail-soft); a `--summary` smoke shows the buckets.

## As-built (implementation)

The planned two `llm_calls` indexes were **already present** — `idx_llm_calls_role`
and `idx_llm_calls_called_at` exist in `schema.py` and migration
`006_create_llm_calls`. The database-architect's "no index" finding came from a
`head`-truncated grep; the planned index migration was dropped as redundant, and
a regression test now guards their presence. Everything else shipped as planned:
per-attempt logging, unpriced failures, `embedding` vs `embedding:curation` roles,
the `commit` control, fail-soft metadata-only logging, and the retention radar
item.

## See also

- [Plan](plan.md) · [Test Guide](test-guide.md)
- [Decisions — 1.0 flag posture (two-pass revisit gate)](../../../../decisions.md)
- [Debt D-003](../../../../debt.md) · [AI Engineering Audit — AI-09](../../../../ai-engineering-audit.md)
