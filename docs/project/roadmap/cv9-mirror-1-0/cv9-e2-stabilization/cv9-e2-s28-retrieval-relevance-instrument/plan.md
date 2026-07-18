[< CV9.E2.S28](index.md)

# CV9.E2.S28 — Plan

## Problem

AI-14: nothing measures whether the ranker surfaces the *right* memories — only that its math is self-consistent (`evals/retrieval.py`). `SEARCH_WEIGHTS`/`MMR_DEDUP_THRESHOLD` rest on judgment, not measurement.

## The decision the audit's own text got wrong

The audit says the DS2/DS3 fixture infrastructure "already exists" for this fix. It does, but as a **parity** oracle (`spikes/ts-search-parity/`): the TS port must reproduce the *Python ranker's own output*. Grading relevance against the ranker's own output is circular. The *technique* (freeze `now` + freeze embeddings, drive the real ranker) is reusable; the *labels* — independently authored ground truth — are not, and are the actual new work.

## Design

### Frozen, not live (Navigator-confirmed)

Corpus + query embeddings generated once (keyed, `generate_fixtures.py`) and committed. The eval itself is keyless and deterministic. Rejected the audit's literal "an embedding call per query per run" — frozen is strictly stronger (reproducible, CI-honest) for the specific question this story answers (does a weight change affect ranking?), with embedding-model drift left to AI-06's separate model-pin probe.

### Corpus + rubric (database-architect, prompt-engineer)

30 synthetic memories, 7 clusters + distractors, `created_at`/`relevance_score`/`use_count` deliberately decorrelated from query-relevance labels (so recency/reinforcement alone can't solve the task — a genuine hybrid-ranker test). Written rubric authored first (prompt-engineer's catch: unlabeled "relevant" is underspecified and produces inconsistent judgments).

### Measurement shape (ai-engineer)

Each labeled query = one `EvalProbe` (hit@k pass/fail) → the probe pass rate *is* hit@k, for free, via the existing `EvalReport.score` mechanism. MRR rides as one always-passing informational probe (no natural pass/fail). `THRESHOLD` set from the measured baseline, not guessed — and since this eval is fully deterministic (unlike the live evals), the threshold can be set tight (right below a perfect score) rather than buffered for sampling noise.

### Cross-module safety (devops-engineer, discovered necessity during build)

Freezing `search.py`'s `datetime`/`generate_embedding` at module import time would leak into other evals sharing a process under `eval --all` (e.g. `evals/retrieval.py`'s own time-relative probes). Designed a per-probe `_frozen_clock_and_embedding` context manager instead, restoring state in `finally`. Verified two ways: a direct unit test (including under a raised exception) and a real `eval --all` run.

## TDD

1. Author corpus/rubric/queries (`authoring.py`) — pure data, no tests needed at this stage.
2. Generate fixtures live (keyed, one-time) — `corpus.json`/`queries.json` committed.
3. Build `evals/retrieval_relevance.py`; run once to measure the real baseline (18/18, MRR 0.9074) before setting `THRESHOLD`.
4. Write `test_retrieval_relevance_fixture_contract.py`: fixture integrity (referential integrity between queries and corpus, embedding dimensions), freeze/restore correctness, and — since the eval is deterministic — genuine baseline-locking regression tests (not just structural checks).
5. "Prove it bites": a throwaway-process weight perturbation, confirmed the score collapses (1.0 → 0.3158) — never touched repo files.
6. Update the discovery contract test (10 → 11).

## Unplanned discoveries during verification (not this story's design scope)

Running a real `eval --all` (to verify cross-module safety) surfaced:
- `test_eval_modules.py` never included S25's `journal`/`title_tags` — fixed (mechanical, retroactively green).
- `title_tags.py`'s injection probe had a call-signature bug preventing it from ever executing since S25 — fixed (mechanical).
- Once fixed, the probe is genuinely red (4/4 reproducible): registered as **AI-25**, not fixed here — out of scope, "probe first, harden separately" per the AI-22 precedent.
- Corrected the audit's prior "AI-11 fully closed" claim, which rested on a probe that had never run.

## Scope honesty

Retuning weights, a live-embedding drift variant, promoting hit@k to a CI gate, and fencing `CONVERSATION_TITLE_PROMPT`/`CONVERSATION_TAGS_PROMPT` (AI-25) are all named, not built.
