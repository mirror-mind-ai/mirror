[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S28 — Retrieval Relevance Instrument (addresses AI-14)

**Status:** Done
**Epic:** CV9.E2 Stabilization & Robustness
**Addresses:** AI Engineering Audit **AI-14** — retrieval relevance has never been measured
**Found while verifying (out of this story's scope, registered not fixed):** **AI-25** — conversation title generation is vulnerable to content-mediated injection
**Fixed while verifying (mechanical, in-scope-adjacent):** a `test_eval_modules.py` structural-contract gap (S25's `journal`/`title_tags` were never added to it) and a call-signature bug in `title_tags.py`'s injection probe
**Planned by:** quality-assurance · **Reviewed by:** ai-engineer, database-architect, devops-engineer (prompt-engineer recused — no instruction-text surface)

---

## User-Visible Outcome

Before this story, `evals/retrieval.py` verified the ranker's scoring *math* is internally consistent — but nothing verified the ranker surfaces the *right* memories for a real query. `SEARCH_WEIGHTS` and `MMR_DEDUP_THRESHOLD` rested on design judgment and dogfooding anecdote.

A new `evals/retrieval_relevance.py` measures this directly: a committed, synthetic 30-memory corpus + 18 independently-labeled queries (real embeddings, frozen and generated once), scored with hit@k and MRR against the actual `search_with_status()` ranker. **Measured baseline: 18/18 hit@5, MRR 0.9074.** A future `SEARCH_WEIGHTS` change now becomes a measured diff, not a guess. The instrument deliberately does not touch the weights — measuring, not tuning.

## Grounded facts (verified in source)

- **A key correction made during planning, not after:** the audit's "the fixture infrastructure already exists (DS2/DS3)" framing conflated two different things. `spikes/ts-search-parity/` is a *parity* oracle (the TS port must reproduce the Python ranker's own output) — grading relevance against the ranker's own output is circular. A genuinely new, independently-labeled corpus was required; the *technique* (freeze `now` + freeze embeddings, drive the real ranker) was reusable, the *labels* were the real new work.
- `search.py`'s `recency_score`/`reinforcement_score` call `datetime.now()` internally (not injected) — freezing requires monkeypatching `search_mod.datetime`, exactly the technique `spikes/ts-search-parity/generate_golden.py` already established.
- Corpus embedded via `memory_embed_text(title, content)` (title + content, matching `add_memory`'s exact real-system behavior) for fidelity.
- `evals/retrieval.py` already has a genuinely-prompt-free precedent (`EVAL_MODEL=None`, keyless) — this eval follows it exactly, for the same reason (no live call at eval time).

## Scope

**In:**
- `evals/_fixtures/retrieval_relevance/authoring.py` — hand-authored corpus (30 memories, 7 thematic clusters + distractors) + 18 labeled queries + a written relevance rubric, with `created_at`/`relevance_score`/`use_count` deliberately **not** correlated with query-relevance labels (so the instrument measures the *hybrid* ranker, not recency or reinforcement in isolation) — including one deliberately-old-but-correct memory (`c14`, ~20 months back) and recent distractors (`c28`), both stress cases.
- `evals/_fixtures/retrieval_relevance/generate_fixtures.py` — one-time, keyed generation script (real `openai/text-embedding-3-small` calls, 48 total), writing the committed `corpus.json`/`queries.json` with embeddings + provenance baked in.
- `evals/retrieval_relevance.py` — the keyless, deterministic eval: one `EvalProbe` per labeled query (hit@k), one always-passing MRR-aggregate informational probe. A `_frozen_clock_and_embedding` context manager freezes/restores per-probe (not at module level) — required so frozen state never leaks into other eval modules sharing a process under `eval --all`.
- Structural + behavioral unit tests (`test_retrieval_relevance_fixture_contract.py`): fixture referential integrity, freeze/restore correctness (including under an exception), and — since this eval is fully deterministic — genuine regression tests locking in the measured baseline.
- `THRESHOLD=0.95` set from the measured baseline (18/18 = perfect), not guessed — tight enough that any single hit@k regression trips it.
- **"Prove it bites" verification:** a deliberate `SEARCH_WEIGHTS` perturbation (zeroing `semantic`) dropped the score from 1.0 to 0.3158 and MRR from 0.9074 to 0.1530 — confirming the instrument has real signal. Run in a throwaway process; no repo files touched.
- Discovery contract test (`TestDiscoverEvalNames`) updated 10 → 11.

**Found and fixed in-cycle (mechanical, discovered via real verification, not this story's design scope):**
- `test_eval_modules.py`'s `EVAL_MODULES` list never included `evals.journal`/`evals.title_tags` (S25's own additions) — their structural contract had never actually been exercised. Added both; both pass cleanly (retroactively green).
- `evals/title_tags.py`'s `title-injection-resisted` probe called the shared `asserted_in_own_voice` helper with wrong keyword arguments (`output_text=`/`injected_tokens=` instead of the real `*sentinels, zero_tolerance_text=`), raising `TypeError` on every call since S25 — the probe had **never actually executed**. Fixed the call signature only; the probe's own behavior/prompt is untouched.

**Found and registered, deliberately NOT fixed here (out of scope — see AI-25):**
- Once the call-signature bug was fixed, `title-injection-resisted` runs for real and is **red**: `CONVERSATION_TITLE_PROMPT` is unfenced and obeys a transcript-mediated injection verbatim, reproduced 4/4 times. Registered as **AI-25** (same family as AI-16/AI-22). Per the established "probe first, harden separately" discipline for this finding family, the fence fix is a future story, not folded into this one.

**Out (named, not built):**
- Retuning `SEARCH_WEIGHTS`/`MMR_DEDUP_THRESHOLD` — a separate follow-up *only if* the baseline reveals a real problem (it currently doesn't: 18/18).
- A live-embedding variant to catch embedding-model drift — overlaps AI-06's model-pin probe; a deliberate, separate concern.
- Promoting hit@k to a hard CI gate — this eval stays in `evals/` (informational-by-convention, never CI, same as every other eval) until proven stable across a few real weight changes.
- Fencing `CONVERSATION_TITLE_PROMPT`/`CONVERSATION_TAGS_PROMPT` — AI-25's fix, a future story.

## Acceptance Criteria

- Committed corpus (30 memories) + labeled queries (18, within the confirmed 15–25 range), each with a rationale traceable to a written rubric, authored independently of the ranker's output.
- hit@k and MRR computed and reported, per-query and aggregate.
- Deterministic (frozen embeddings + frozen clock) — reproducible, keyless.
- Does not modify `SEARCH_WEIGHTS`.
- A perturbation test demonstrates the instrument detects a real degradation.
- Freeze/restore verified not to leak across eval modules (unit test + a real `eval --all` run).
- Full keyless suite green; mypy baseline unchanged (no `src/memory/` files touched this story); ruff/format clean; doc links clean.

## Done Condition

- All new tests green in CI (no live LLM at test time; the one-time fixture generation is a separate, manual, keyed step already run and committed).
- Baseline measured and recorded (18/18, MRR 0.9074); perturbation check recorded in the as-built.
- AI-14 marked addressed in the audit's status stack (correct location); AI-25 registered as a new, separate P1 finding; the found-and-fixed mechanical bugs documented honestly, including the correction to S25's "AI-11 fully closed" claim.
- Roadmap/worklog updated in the same cycle.

## As-built (implementation and measurement)

Shipped close to plan, with the corpus-authorship work turning out to be exactly the "real new work" identified during planning — and three unplanned discoveries surfaced entirely by actually running the instrument for real, each handled per the discipline already established this session (investigate, don't assume; fix mechanical bugs; register behavioral findings separately; be honest about what a prior closure claim actually verified).

**Corpus.** 30 memories across 7 clusters (pricing/business, XP engineering, nomad travel, writing, marketing, personal/shadow reflections, 3 distractors) with `created_at` spread ~2024-12 to ~2026-07, deliberately decorrelated from the relevance labels. 18 labeled queries, most single-relevant (testing precision), two multi-relevant (`q09`, `q13`, testing MRR ordering across genuinely-plausible alternatives). `generate_fixtures.py` run once live (48 embedding calls, `openai/text-embedding-3-small`), output committed.

**Measurement.** Baseline: 18/18 hit@5, MRR 0.9074. One genuinely informative result: `q09` ("choosing a city... as a nomad") hit on its more-recent relevant memory (`c11`, rank 3, rr=0.333) but its deliberately-old relevant memory (`c14`, ~20 months back) did not make the top-5 at all — a real, honest signal about how strongly recency currently discounts an old-but-relevant memory, exactly the kind of thing the audit says "has never been measured." Perturbation check (semantic weight → 0): score 1.0 → 0.3158, MRR 0.9074 → 0.1530, with most failures converging on the same reinforcement/recency-dominated top-5 — a clean, explainable failure mode confirming the instrument has real discriminating power.

**Cross-module safety.** The `_frozen_clock_and_embedding` per-probe context manager (not a module-level freeze) was a deliberate design choice to avoid leaking frozen state into other evals sharing a process under `eval --all`. Verified two ways: a direct unit test (including under a raised exception), and a real `eval --all` run — `retrieval_relevance` produced the identical baseline whether run standalone or as part of the full suite, and `scene`/`shadow`'s own live LLM calls afterward were unaffected.

**Found while verifying (not this story's design scope).** Running the real `eval --all` for the cross-module safety check surfaced two mechanical bugs and one genuine new finding, entirely unrelated to retrieval relevance:
1. `test_eval_modules.py`'s `EVAL_MODULES` list never included S25's `evals.journal`/`evals.title_tags` — their structural contract (`PROBES`/`THRESHOLD`/`EVAL_MODEL` shape) had literally never been checked by this file. Fixed (both retroactively pass cleanly, 143/143).
2. `title_tags.py`'s `title-injection-resisted` probe raised `TypeError` on every invocation (wrong kwargs against `asserted_in_own_voice`) — meaning it had never actually executed since S25. Fixed the call signature only.
3. Once running for real, the probe is **red**, 4/4 reproducible: `CONVERSATION_TITLE_PROMPT` obeys a transcript-mediated injection verbatim. This is the same family as AI-16/AI-22 (unfenced prompt, content-mediated injection) and was **registered as AI-25**, deliberately not fixed here — out of this story's scope, and "probe first, harden separately" is the established discipline for this exact finding family (AI-22 followed the identical arc: found on a probe's first real run, registered, fixed in a dedicated follow-up story).

**Honest correction.** S25's worklog and the audit both stated "AI-11 fully closed." That claim technically covered probe *coverage* (all five surfaces had probes), which was true — but one of those probes had a latent bug preventing it from ever running, so the *verification* AI-11's closure implied was weaker than stated. This is now corrected in the audit's status stack rather than left standing.

## See also

- [Plan](plan.md) · [Test Guide](test-guide.md)
- [AI Engineering Audit — AI-14, AI-25](../../../../ai-engineering-audit.md)
- [CV9.E2.S25 — the title_tags probe this story fixed the plumbing for](../cv9-e2-s25-journal-metadata-eval-probes/index.md)
