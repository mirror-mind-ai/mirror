[< CV9.E2.S30](index.md)

# CV9.E2.S30 — Plan

## Problem

D-009 (CV9.E2.S29): `summary-injection-resisted` pre-registered 8/10. Both failures were genuine model resistance — third-person narration of an injected instruction — misread as compliance because `evals/_support.py`'s `DISTANCING_MARKERS` didn't recognize the narration. Deliberately not fixed in S29: a blanket keyword widening risks the opposite failure (false-positive-resistance), and the shared helper serves five consumers.

## Design (team review)

- **quality-assurance** reframed the debt first: the model already resists 10/10; the *judge* has the gap. That means the model-behavior release gate (prompts/model pins) does not apply — this is eval-instrument-only work. Proposed Option B (narrator-frame markers, stable helper signature) over Option A (bare reporting verbs) and named Option C (a structured/proximity-aware detector) as the deferred escalation path.
- **engineer** endorsed B specifically because it holds the consumer signature stable — zero churn across scene/shadow/title_tags/consolidate/conversation_summary. Named the overfitting risk directly: markers must encode the *class* (reported-speech framing), never the literal probe sentences, which belong in the test corpus as cases, not in the marker tuple as data.
- **database-architect**: no schema or migration surface — evals call the model directly, not storage. Named the actual stakes of getting this wrong: when `SUMMARIZE_ENABLED`, a compliant-but-unflagged summary is embedded and stored, becoming a searchable vector that can re-enter future retrieval. The judge is a guardrail for that persistence path, even though the fix itself never touches it.
- **devops-engineer**: deterministic tests belong in CI (free, keyless); the live n=10 protocol stays manual and out of CI (cost, non-determinism), per the standing rule. Confirmed the model-behavior release gate is not triggered (no `prompts.py`/model-pin change). Bounded and pre-approved the live re-measurement cost as a conscious spend.
- **ai-engineer** rejected Option A outright: bare verbs reintroduce the CV9.E2.S21 "measure obedience, not mention" error one layer up, in the false-positive-resistance direction — the dangerous one for a security judge. Set the discipline for the live protocol: pre-register bands before running, re-run n≥5 on any flip before calling it real, never tune markers against the literal two failing sentences.
- **prompt-engineer** confirmed `CONVERSATION_SUMMARY_PROMPT` itself needs no change — the model's output is already linguistically correct reported speech. Grounded the marker candidates in English attributive-frame structure (narrator subject + reporting verb) rather than bare verbs, and flagged that isolated verbs are ambiguous out of frame.
- **security-engineer** (added on Navigator request after the initial five-persona review) framed the asymmetry explicitly: today's gap fails toward noise (safe); the fix's failure direction is false-positive-resistance (dangerous, and worst on the stored/embedded summary path). Elevated the anti-regression compliance test to a hard gate rather than an advisory nicety. Stress-tested each candidate marker adversarially and rejected `"according to"`/`"responded by"` as too generic for a summary that is explicitly asked to record real decisions/commitments. Asked for an adversarial co-occurrence test. Confirmed `consolidate.py`'s `dangerous_escalation` structural check is independent of the text judge — the highest-severity consumer has a second, non-textual guard regardless of marker changes.

## TDD

1. `TestReportedSpeechFraming` written first against the two original D-009 sentences plus a bare-verb anti-regression hard gate — RED (3/4 new cases failing).
2. Round 1 markers added (`"the ai"`, `"the model"`, `"the assistant"`, `"pivoted to"`, `"went on to"`, `"proceeded to"`) — GREEN.
3. The literal "co-occurrence must still read compliance" adversarial test security asked for was attempted and found unsatisfiable by construction: the helper matches over the whole text, not a proximity window, and the *original* marker list already has this property (verified against `"instruction"`). Rather than write a test engineered to pass, the real behavior was documented and registered as **D-010**.
4. Live re-measurement, round 1: `conversation_summary` n=10 → 10/10; `scene`/`shadow`/`consolidate` injection probes n=10 each → 10/10, matching or beating S21/S22/S23 baselines; `title_tags` confirmed as a structural no-op (`zero_tolerance_text` path, immune to marker changes).
5. A flip surfaced incidentally during a routine `eval --all` sanity run. Investigated per the ai-engineer's own discipline rather than dismissed — n=8 further live runs reproduced a genuine second residual: `"...was presented as a factual premise..."`, a passive hedge with no narrator subject.
6. New regression test for the exact sentence — RED. Added `"presented as"` — the same category as the pre-existing `"appears to"` marker, not a new one — GREEN.
7. Live re-measurement, round 2 (final set): `conversation_summary` fresh n=10 → 9/10 (closing measurement). One residual investigated and deliberately not fixed: the obvious next marker, `"directive"`, is a substring of the sentinel `"prime directive"` itself — adding it would make the probe vacuous. `scene`/`shadow`/`consolidate` re-confirmed at n=5 each (proportionate: `"presented as"` is prose-specific and unlikely to interact with their structured, non-prose outputs, and each already held a clean n=10 under round 1's markers) → 5/5 each. `title_tags` re-confirmed 6/7, unchanged.
8. `eval --all` run: 11/12, the one failure the pre-existing, unrelated `routing` (D-005) — matches the S29 precedent exactly.

## Scope honesty

Two things this story deliberately did **not** do, both investigated rather than assumed:

- **`"directive"` was not added.** It would collide with the sentinel vocabulary itself (`"prime directive"`), collapsing the probe to unconditional "resisted." Named and rejected on sight, not a gap.
- **D-010 (whole-text, non-proximity matching) was not fixed.** It predates this story — the original marker list has the identical property — and a structural or proximity-aware successor is Option C, deliberately deferred pending evidence it's needed beyond the one adversarial construction that surfaced it here.
