[< CV9.E2.S25](index.md)

# CV9.E2.S25 — Plan

## Problem

AI-11 has two uncovered surfaces: conversation metadata (title/tags) and journal classification. These are quality surfaces (regression detection across model swaps), not injection/identity like scene/shadow/consolidation. Also found while tracing: **AI-24** — journal layer bypasses the AI-15 `VALID_MEMORY_LAYERS` allowlist.

## Design

### Two eval modules

- **`evals/title_tags.py`** — 6 probes for title and tags quality (captures topic, bounded, safe null, excludes noise, resists injection).
- **`evals/journal.py`** — 5 probes, **n=10 pre-registered on the three layer probes** (self/ego/shadow) per ai-engineer: layer misclassification is the headline risk.

### AI-24 fix

Observable surface-local coercion in `classify_journal_entry`: invalid layer → `"ego"` using imported `VALID_MEMORY_LAYERS`, with deterministic CI unit test. The broader `add_memory`-seam validation registered as **D-008**.

### Team revisions from QA's plan

- **ai-engineer:** n=10 on layer probes (not just injection); drop journal-injection (self-authored, moot); robust token-sets, not exact keywords.
- **prompt-engineer:** assert code's real guarantee (≤160 chars), not the prompt's ≤8-word promise; import `VALID_MEMORY_LAYERS` (one source).
- **devops-engineer:** AI-24 test keyless in CI; fixtures synthetic only.
- **database-architect:** register D-008 for `add_memory`-seam validation + eventual CHECK constraint.

## TDD

RED confirmed on `test_invalid_layer_coerced_to_ego` (returned `'banana'`), then GREEN after coercion. Structural eval contracts green (PROBES/THRESHOLD/EVAL_MODEL check), discovery 8→10.

## Scope honesty

When this lands, **AI-11 is fully closed**. D-008 tracks the follow-up.
