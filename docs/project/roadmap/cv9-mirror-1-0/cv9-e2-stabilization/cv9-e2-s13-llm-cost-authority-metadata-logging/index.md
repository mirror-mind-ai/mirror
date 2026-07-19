[< CV9.E2](../index.md)

# CV9.E2.S13 — LLM Call Cost Authority & Metadata-Default Logging

**Status:** Done — Navigator validated 2026-07-17
**Epic:** CV9.E2 — Stabilization & Robustness
**Source:** [AI Engineering Audit — AI-09](../../../../ai-engineering-audit.md) (P1)

---

## User-visible outcome

By default, every model call in the memory pipeline records **what it was and
what it cost** — role, model, tokens, latency, estimated USD, conversation — and
**never** stores conversation content. A 1.0 user can finally answer "what did
my mirror do, and roughly what did it cost" from `inspect llm-calls`, instead of
the shipped default recording nothing and the opt-in recording full transcripts
at zero cost.

## Problem

Three defects compound (verified in code): `MEMORY_LOG_LLM_CALLS` defaults
**off** (`config.py:346`), so the shipped product is flying blind; when enabled
it stores **full prompt + response bodies** (every logger passes
`prompt`/`response` — no metadata-only mode); and even then `cost_usd` is
**always NULL** because `send_to_model` hardcodes `total_cost=None`
(`llm_router.py:110`) and no logger passes `cost_usd`. "Evidence over vibes" is
the project's own posture, yet the default gives the user and the developers no
token counts, no latency history, and no cost accounting.

## Scope

- **Three-mode flag.** `MEMORY_LOG_LLM_CALLS` resolves to `off | metadata |
  full`, default **`metadata`**. Back-compat: `1` → `full` (keeps its old
  "log bodies" meaning), `0`/`off` → off. Metadata mode records
  role/model/tokens/latency/cost/conv/session with `prompt=''`, `response=''`.
- **Cost authority.** New `intelligence/cost.py`: a static `model → price per 1K
  tokens` table and `compute_cost(model, prompt_tokens, completion_tokens) ->
  float | None`. Unknown model or missing usage → `None` (never a silent `0`).
  Pipeline cost is labeled **estimated**; the live `/generation` fetch stays a
  consult-only refinement (it blocks ~10s and cannot sit on a hook path).
- **One logger seam.** Replace the six duplicated `on_llm_call` closures
  (`services/conversation.py`, `services/memory.py`, `services/tasks.py`,
  `skills/mirror.py`, `cli/consolidate_cmd.py`, `cli/shadow_cmd.py`) with one
  `build_llm_logger(...)` factory that owns the body/cost policy, computes cost,
  and is **fail-soft** — a logging or pricing error can never raise into
  extraction (which, since [CV9.E2.S7](../cv9-e2-s7-extraction-failure-isolation/index.md),
  would otherwise quarantine a real conversation).
- **Per-row cost in the read surface.** `inspect llm-calls` renders the stored
  `cost_usd` per row so the change is Navigator-verifiable without SQL.
- **Decision record.** `decisions.md` records the metadata-by-default posture
  (the AI-20 flag-posture decision, resolved for this one flag).

## Non-goals

- `inspect llm-calls --summary` aggregation and the consult ledger →
  [CV9.E2.S14](../cv9-e2-s14-llm-spend-summary-consult-ledger/index.md).
- **Embedding-call logging** — the biggest invisible spend, but
  `generate_embedding` is context-free and on the search hot path; logging it
  well needs its own design. Deferred to a follow-up story.
- Live per-call cost fetch on the pipeline path (static table only).
- New schema columns — `cost_usd` already exists and the `NOT NULL`
  `prompt`/`response` columns accept `''`, so **no migration**.
- The rest of the AI-20 flag-posture doc beyond this one default.

## Done condition

- Unset env → pipeline loggers write rows with **non-null estimated cost** and
  **empty** bodies; `full` includes bodies; `off`/`0` writes nothing; `1` →
  `full`.
- `compute_cost` returns correct USD for known models and `None` for
  unknown/missing usage.
- A logging or pricing error **cannot** break or quarantine extraction.
- `inspect llm-calls` shows cost per row.
- `decisions.md` records the metadata-by-default posture.
- Keyless unit + integration, ruff, and mypy gates green.

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [CV9.E2.S14 — Spend Summary & Consult Ledger](../cv9-e2-s14-llm-spend-summary-consult-ledger/index.md)
- [AI Engineering Audit — AI-09](../../../../ai-engineering-audit.md)
