[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S25 — Journal & Conversation-Metadata Eval Probes (closes AI-11)

**Status:** Done  
**Epic:** CV9.E2 Stabilization & Robustness  
**Closes:** AI Engineering Audit **AI-11** fully (item 1 S19 · item 2 S20/S22/S23/S25 · item 3 S24)  
**Closes:** new finding **AI-24** — journal layer classification bypasses the AI-15 allowlist  
**Registers:** **D-008** — `layer` domain constraint enforcement at `add_memory` seam  
**Planned by:** quality-assurance · **Reviewed by:** ai-engineer, prompt-engineer, devops-engineer, database-architect

---

## User-Visible Outcome

The last two uncovered LLM surfaces now have eval probes: conversation metadata quality (`generate_conversation_title` / `generate_conversation_tags`) and journal classification (`classify_journal_entry`). Unlike scene/shadow/consolidation (safety surfaces), these are **quality surfaces** — regression detectors across model swaps, which is exactly what the new `eval --all` gate (S24) needs to be meaningful.

AI-11 is now **fully closed**: persistence (item 1, S19), probe coverage for every LLM surface (item 2, S20/S22/S23/S25), and the release gate + playbook (item 3, S24).

Also closed: **AI-24** — `classify_journal_entry()` returned model-chosen layers with no validation against `VALID_MEMORY_LAYERS`. Fixed with observable surface-local coercion (invalid → `"ego"`) + deterministic CI unit test.

## Grounded facts (verified in source)

- **Title/tags functions:** `generate_conversation_title()` (max ~8 words, ≤160 chars enforced, safe null `""`), `generate_conversation_tags()` (3–6 durable thematic tags, exclude noise tokens per prompt).
- **Journal classification:** `classify_journal_entry()` returns `{title, layer, tags}` with layer ∈ `{self, ego, shadow}` per Jungian criteria. Pre-S25: no allowlist check, so `layer: "banana"` flowed to `add_journal` → `add_memory`.
- **AI-24 blast radius:** low (self-authored journal content; worst case mislayer surfaces in wrong context).

## Scope

**In:**
- `evals/title_tags.py`: 6 probes (`title-captures-topic`, `title-bounded-no-names`, `title-trivial-empty`, `title-injection-resisted`, `tags-capture-themes`, `tags-exclude-noise`).
- `evals/journal.py`: 5 probes, **pre-registered n=10 on the three layer probes** (the ai-engineer's catch: layer misclassification is the quality risk).
- **AI-24 fix:** `classify_journal_entry` coerces invalid layer to `"ego"` using imported `VALID_MEMORY_LAYERS`, with CI unit test (deterministic, keyless).
- Discovery contract test **8 → 10**.
- D-008 registered for the `add_memory`-seam follow-up.

**Out (deferred with named homes):**
- `add_memory`-seam `layer` validation (D-008).
- SQLite `CHECK` constraint on `layer` (D-008's durable end state).

## Acceptance Criteria

- Structural contract tests green in CI (no live call): `PROBES`/`THRESHOLD`/`EVAL_MODEL`/`EVAL_PROMPTS` assertions.
- AI-24 fix: deterministic CI unit test (mock invalid layer, assert coercion).
- Discovery test expects 10 modules.
- Probes assert robust signals (token-sets, not exact keywords; unambiguous exemplars).
- `VALID_MEMORY_LAYERS` imported in both the journal-validity probe and the AI-24 fix.
- Full keyless suite green; mypy D-006 baseline unchanged.

## Done Condition

- All deterministic tests green in CI; AI-24 coercion verified.
- Discovery finds 10 modules; structural eval contracts pass.
- Docs/roadmap/audit/worklog/debt updated; AI-11 marked fully closed.

## See also

- [Plan](plan.md) · [Test Guide](test-guide.md)
- [AI Engineering Audit — AI-11](../../../../ai-engineering-audit.md)
- [Debt D-008](../../../../debt.md#d-008--layer-domain-constraint-enforced-inconsistently-across-write-paths)
