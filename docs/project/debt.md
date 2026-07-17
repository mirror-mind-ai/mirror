# Technical Debt Ledger

This ledger records structural cost the project is consciously carrying.

Do not record every imperfection. Record debt that may affect future delivery,
safety, maintainability, validation, operation, or product coherence.

## States

```text
Carried   known and accepted for now
Paying    currently being reduced by active work
Paid      resolved or reduced enough to close
Dropped   no longer relevant or replaced by another item
```

## Debt Items

| ID | Title | Kind | Severity | Status | Source | Revisit Trigger |
|----|-------|------|----------|--------|--------|-----------------|
| D-001 | Metadata lifecycle policy and evidence filtering live inside ConversationService | design | medium | Paid | CV9.DS7.US1 / CV9.DS7.TS1 / CV9.DS7.TS2 | Policy boundary extracted before US2 apply behavior |
| D-002 | Journey search silently returns `[]` on embedding failure | product | low | Carried | CV9.E2.S1 (AI-E4) | A "no journeys matched" report that is actually an embedding outage, or unifying journey degradation with memory-search's lexical fallback |
| D-003 | Embedding calls bypass the `llm_calls` ledger (invisible spend, amplified by S1 retry) | observability | medium | Carried | CV9.E2.S1 (AI-E1, AI-09 tail) | An AI-09 follow-up, or the first time retry-driven embedding spend needs measuring |

## D-001 — Metadata lifecycle policy and evidence filtering live inside ConversationService

**Kind:** design  
**Severity:** medium  
**Status:** Paid  
**Source:** CV9.DS7.US1 / CV9.DS7.TS1 / CV9.DS7.TS2  

### Carrying reason

US1 needed an observable non-mutating dry-run, and TS1 added enough policy to
avoid brittle title decisions. Keeping the policy helpers in `ConversationService`
is acceptable while the behavior remains dry-run-only.

### Revisit trigger

Triggered before CV9.DS7.US2 implementation. Apply/mutation behavior would make
metadata lifecycle policy, evidence filtering, or write boundaries harder to
reason about if the policy remained embedded in `ConversationService`.

### Closure condition

Policy and evidence filtering are either small enough to remain local, or they
are extracted into a clearer metadata lifecycle policy/service boundary before
mutation behavior is added.

### Result

Paid by CV9.DS7.TS2. Metadata lifecycle dry-run policy now lives in
`memory.services.metadata_lifecycle`, while `ConversationService` keeps storage
orchestration and public service entrypoints.

### Notes

Current evidence terms are useful for candidate signaling but noisy. This is not
blocking while decisions remain non-mutating and candidate-based.

## D-002 — Journey search silently returns `[]` on embedding failure

**Kind:** product  
**Severity:** low  
**Status:** Carried  
**Source:** CV9.E2.S1 (AI-E4)  

### Carrying reason

Memory search degrades to lexical-only and flags `degraded=True` (CV9.E2.S10),
but `JourneyService.find_relevant_journeys` wraps the query embedding in
`except Exception: return []`. On an embedding outage that empty result is
indistinguishable from "no journeys matched" — the exact silent-failure pattern
CV9.E2.S16 (AI-10) removed for extraction. S1 did not introduce this (an
`IndexError` slipped past the same handler before), and S1 deliberately did not
unify all five embedding-failure behaviors across the surfaces.

### Revisit trigger

A user reports a suspicious empty journey match during a provider outage, or a
later story unifies embedding-failure degradation across search surfaces.

### Closure condition

Journey search either surfaces an explicit degraded signal (like memory search)
or deliberately documents the empty-on-failure behavior as intended.

## D-003 — Embedding calls bypass the `llm_calls` ledger

**Kind:** observability  
**Severity:** medium  
**Status:** Carried  
**Source:** CV9.E2.S1 (AI-E1, AI-09 tail)  

### Carrying reason

`generate_embedding` calls the provider directly with no `on_llm_call` seam, so
embedding spend never lands in `llm_calls` — even though `intelligence/cost.py`
already prices `openai/text-embedding-3-small`. AI-09 (CV9.E2.S13/S14) made the
rest of the pipeline observable by default; embeddings are the one hot-path model
call still dark. S1 adds bounded retry (up to `EMBEDDING_ATTEMPTS` calls on the
empty-payload path), which amplifies this invisible spend. The invisibility is
pre-existing, not created by S1, and does not block correctness; S1 bounds the
worst case by keeping `EMBEDDING_ATTEMPTS` small so the deferral stays safe.

### Revisit trigger

An AI-09 follow-up story, or the first time retry-driven embedding spend needs to
be measured or attributed.

### Closure condition

Embedding calls record a metadata-only `llm_calls` row (role, model, tokens,
latency, computed cost) through the same fail-soft seam as the rest of the
pipeline.
