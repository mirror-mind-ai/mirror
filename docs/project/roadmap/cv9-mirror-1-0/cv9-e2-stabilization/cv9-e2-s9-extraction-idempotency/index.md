[< CV9.E2](../index.md)

# CV9.E2.S9 — Extraction Idempotency Across Partial Failure

**Status:** Done — Navigator validated 2026-07-16
**Epic:** CV9.E2 — Stabilization & Robustness
**Source:** [AI Engineering Audit — AI-03](../../../../ai-engineering-audit.md) (P0)

---

## User-visible outcome

A conversation whose memory extraction fails partway (an embedding call fails on
the third of five memories) does not leave a partial set of memories behind.
When the maintenance loop retries it (CV9.E2.S7), the retry does not duplicate
rows or re-spend on embeddings — each attempt is all-or-nothing.

---

## Problem

`_extract_and_persist` generates each memory's embedding **inside**
`add_memory`, and `create_memory` commits **per memory**. `metadata.extracted`
is set only after the whole loop. So if `generate_embedding` fails on memory 3
of 5, memories 1–2 are already committed, `extracted` stays false, and the
exception propagates.

This compounds with CV9.E2.S7: that story made failed extractions isolate,
retry (up to `MEMORY_EXTRACTION_MAX_ATTEMPTS`), then quarantine. Each retry
re-runs the LLM (non-deterministic candidates at temperature 0.3), regenerates
embeddings, and re-stores — so the partially-stored memories accumulate as
duplicates with doubled embedding spend. The MMR dedup at 0.92 may or may not
suppress the near-identical variants.

---

## Scope

- **Stage every network embedding first.** In `_extract_and_persist`, generate
  the summary embedding and all memory embeddings before persisting anything. If
  any fails, the exception propagates before a single memory is written, so a
  failed attempt stores nothing and the S7 retry starts clean.
- **Precomputed-embedding store path.** `add_memory` gains an optional
  `embedding` parameter (backward compatible) so the staged vectors are written
  without regenerating them. A shared `memory_embed_text` helper keeps the
  embedded text identical between the staging and generation paths.

---

## Non-goals

- **No transaction wrapper around the local store phase.** After staging, the
  store phase is local-only (no network); `create_memory` commits per row, and
  batching it into one transaction is a store-layer change. Staging alone
  restores idempotency for the audit's failure mode; the residual (a rare local
  write failure mid-loop) is out of scope.
- **No cleanup of pre-existing duplicates.** Rows already duplicated before this
  fix are a separate data task, not a behavior change.
- **No schema change.**

---

## Done condition

- A partial embedding failure persists zero memories and does not set
  `extracted` (S7 still records the attempt).
- A retry after a partial failure yields exactly the successful set — no
  duplicates.
- `add_memory(embedding=...)` stores the given vector without calling
  `generate_embedding`.
- Full unit + integration suite, ruff, and mypy gates green.

---

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [AI Engineering Audit — AI-03](../../../../ai-engineering-audit.md)
- [CV9.E2.S7 — Extraction Failure Isolation](../cv9-e2-s7-extraction-failure-isolation/index.md) (introduced the retry this story makes safe)
