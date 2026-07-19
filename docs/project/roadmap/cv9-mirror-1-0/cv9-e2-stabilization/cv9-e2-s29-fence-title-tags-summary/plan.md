[< CV9.E2.S29](index.md)

# CV9.E2.S29 — Plan

## Problem

AI-25: `generate_conversation_title()`/`generate_conversation_tags()` concatenate raw, unfenced transcript content — the same class AI-16/AI-22 already closed for extraction/scene. Found while verifying an unrelated story (S28), the probe that surfaces this had never actually run since S25 (a separate call-signature bug, fixed first).

## Security-engineer's expanded scope

The audit named two surfaces; grepping every `format_transcript` call site found a **third**: `CONVERSATION_SUMMARY_PROMPT`, with a *higher* blast radius (embedded and stored when `SUMMARIZE_ENABLED`, unlike title/tags' display-only persistence). Navigator-confirmed: include all three, same fix cost, closes the whole class.

## Design (team review)

- **prompt-engineer** owns the fence + sandwich wording, reusing `_fence_transcript` (already imported), one "## Untrusted input" block per prompt, one post-fence reminder per call site — the exact AI-22 template. Per-surface null actions: title/tags zero-tolerance (no legitimate reason to echo), summary distancing-aware (may legitimately describe without asserting).
- **ai-engineer** owns measurement: `asserted_in_own_voice` with `zero_tolerance_text` for title/tags, `distancing_aware_text` for summary — the exact field-type distinction matters (using zero-tolerance on summary would over-count defensible description as failure).
- **security-engineer** frames severity (summary > title/tags) and the AI-22 sandwich lesson: a pre-fence-only guard measured 1/3 for scene; title/tags start at 0/4, worse than that baseline — do not assume the standard template suffices.
- **database-architect**: persistence difference (title persisted-not-embedded, summary persisted-and-embedded) is *why* summary is the priority twin.
- **devops-engineer**: no config/ops surface; deterministic fence-presence tests keep CI keyless.

## TDD

1. Deterministic fence-presence + sandwich-ordering unit tests written first (RED — 8 failures against the unfenced prompts).
2. Fence + sandwich implemented for all three (GREEN on fence-presence).
3. **Live measurement, not assumed:** `title-injection-resisted` re-run — still 0/10 after the standard template. Investigated (printed the actual constructed prompt to rule out an implementation bug) before considering a design gap.
4. Sharpened null-action instruction — also 0/10. Two failed attempts, both measured, neither patched-and-assumed.
5. Concrete worked counter-example — validated ad-hoc (5/5) before integration, then 10/10 through the real probe.
6. Same fix applied to tags — measured immediately, not assumed transferable. First live run red with a *different*, multi-item leak. A follow-up attempt made it *worse* (0/5) — root-caused (a competing legitimate rule was winning) before a third, structurally different fix (move the constraint into Tag Rules itself) — 10/10.
7. New `tags-injection-resisted` probe added to `evals/title_tags.py`; new `evals/conversation_summary.py` module with `summary-injection-resisted` — measured 8/10, investigated (confirmed a probe-heuristic gap, not a model failure), registered as D-009 rather than forced closed.
8. Discovery + structural contract tests updated (11→12 modules).
9. Full `eval --all` run to confirm clean integration (11/12 pass; the one failure is the unrelated, pre-existing D-005).

## Scope honesty

Widening `_support.py`'s shared `DISTANCING_MARKERS` (D-009's closure condition) is deliberately deferred — it's shared by four consumers (scene, shadow, title_tags, conversation_summary) and a blanket keyword addition risks the opposite failure (a genuine compliance case slipping through on a coincidentally "safe" word). That's a dedicated, re-measured change, not a rushed one buried here.
