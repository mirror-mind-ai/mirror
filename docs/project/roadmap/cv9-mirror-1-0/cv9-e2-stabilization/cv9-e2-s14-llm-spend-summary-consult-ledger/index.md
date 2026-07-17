[< CV9.E2](../index.md)

# CV9.E2.S14 — LLM Spend Summary & Consult Ledger

**Status:** Done — Navigator validated 2026-07-17
**Epic:** CV9.E2 — Stabilization & Robustness
**Source:** [AI Engineering Audit — AI-09](../../../../ai-engineering-audit.md) (P1)

---

## User-visible outcome

"What does my mirror cost per week?" becomes answerable. `inspect llm-calls
--summary` reports calls, tokens, and USD **by role and by week**, and consult
calls finally join the ledger — so the spend view spans the whole model surface,
not just the background pipeline.

## Problem

S13 records per-call cost, but there is still no aggregate view, and `consult`
computes a **real** fetched cost (`fetch_generation_cost`) only to print and
discard it — it never writes `llm_calls`. The evidence exists per row but cannot
be rolled up, and the one place with true (not estimated) cost throws it away.

## Scope

- **`inspect llm-calls --summary`.** Aggregate calls/tokens/USD grouped by role
  and by ISO week. NULL-cost rows are labeled *unpriced*, never summed as `0`.
- **`get_llm_call_summary(...)` store method.** One `GROUP BY` query at the
  storage layer (no per-row Python loop).
- **Consult ledger.** `consult` logs its call through S13's `build_llm_logger`
  (metadata-only), storing the **real** `fetch_generation_cost` value rather
  than the static estimate.

## Non-goals

- Embedding-call logging (deferred with S13).
- A `memory costs` top-level alias (revisit only if `--summary` proves
  insufficient).
- Consult privacy / hardcoded-FX cleanup — a separate P2 (AI-17).

## Done condition

- `inspect llm-calls --summary` shows per-role and per-week calls/tokens/USD,
  handling NULL cost without summing it as `0`.
- A consult call appears in `llm_calls` with role `consult` and its real cost.
- Keyless unit + integration, ruff, and mypy gates green.

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [CV9.E2.S13 — Cost Authority & Metadata-Default Logging](../cv9-e2-s13-llm-cost-authority-metadata-logging/index.md)
- [AI Engineering Audit — AI-09](../../../../ai-engineering-audit.md)
