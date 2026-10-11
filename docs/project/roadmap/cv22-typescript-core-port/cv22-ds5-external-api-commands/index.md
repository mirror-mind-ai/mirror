[< CV22 TypeScript Core Port](../index.md)

# CV22.DS5 — External-API Commands

**Status:** ✅ Done
**Type:** Delivery Story
**Flow unit:** story-by-story — DS5 is intentionally not a single implementation unit.

---

## Outcome

Mirror's external-API-backed command paths move behind the TypeScript core without
changing user-visible behavior, while non-determinism is isolated through explicit
record/replay fixtures, scrubbed secrets, and safe fallback boundaries.

DS5 is the first CV22 stage where the TS core must handle provider boundaries:
embeddings, LLM extraction, and consult-style model calls. That makes it different
from DS2/DS4 deterministic parity. It must be split into child stories because the
risks are not homogeneous: search freshness, extraction orchestration, consult
transport, fixture hygiene, and front-door cutover each fail differently.

## Why story-by-story

The Ariad pull initially generated one generic child story and recommended
`delivery_story` flow. That was rejected during Navigator review. DS5 is too broad
to plan and validate as one aggregate implementation unit. The correct granularity
is child-story delivery with a small foundation story first, then observable command
families.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV22.DS5.TS1](cv22-ds5-ts1-external-api-record-replay-secrets-harness/index.md) | External-API Record/Replay + Secrets Harness | Technical Story | TS has a safe provider boundary for external calls: env/config-only secrets, redacted logs/errors, scrubbed fixtures, deterministic replay, and committed tests that never hit live APIs. | ✅ Done |
| [CV22.DS5.US1](cv22-ds5-us1-fresh-embedding-search-parity/index.md) | Fresh Embedding Search Parity | User Story | `memories --search` / semantic search can use TS for the full fresh-query path, including embedding retrieval, access-count strategy, ranker reuse, and reinforcement-write routing where appropriate. | ✅ Done |
| [CV22.DS5.US2](cv22-ds5-us2-extraction-record-replay-parity/index.md) | Extraction Record/Replay Parity | User Story | Conversation/memory extraction orchestration is ported with recorded provider responses, parser parity, and no live-provider dependency in CI. | ✅ Done |
| [CV22.DS5.US3](cv22-ds5-us3-consult-command-parity/index.md) | Consult Command Parity | User Story | Consult-style external model calls have a TS command path with provider safety, replayable tests, and Python-compatible user-facing behavior. | ✅ Done |
| [CV22.DS5.US4](cv22-ds5-us4-front-door-external-api-routing/index.md) | Front-Door External-API Routing And Dogfood | User Story | Ported external-API commands are selectively routed through the TS front door under safe config, with Python fallback for anything unported or unsafe. | ✅ Done |

## Required Plan Inputs

- API keys are read from env/config only; never from argv.
- Secrets and authorization headers are never logged and never committed in
  record/replay fixtures.
- Error messages redact provider credentials and sensitive payloads.
- DS5 must include the access-count read strategy recorded in Decisions: TS may
  use a single grouped query when parity proves semantic equivalence with the
  Python per-memory count loop.
- Reinforcement-write routing carried from DS4 belongs with the fresh search path,
  because the write fires inside search behavior rather than as a standalone CLI
  command.
- All live-provider use is outside CI unless explicitly marked and manually run.
- Existing Python fallback remains available until each command family has passed
  replay, local smoke, and Navigator validation.

## Done Condition

- External-API provider boundaries exist in TS with deterministic record/replay
  coverage and scrubbed fixtures.
- Fresh semantic search, extraction, and consult command families have TS parity
  evidence appropriate to their non-deterministic boundary.
- Secrets handling, logging, and fixture hygiene satisfy the RS005 security riders.
- The TS front door routes only the validated external-API command families; all
  other external or mutating paths still fall back to Python.
- No CI path requires live OpenRouter/Gemini/OpenAI credentials.

## Non-Goals

- No schema custody transfer or Python deletion — that is DS6.
- No provider behavior redesign; this is parity plus safe boundary isolation.
- No broad npm packaging work.
- No committed real provider secrets, raw live payloads, or private database
  material.

## Handoff Review

A post-implementation multi-persona handoff review was recorded in [`handoff-review.md`](handoff-review.md). The review found no blockers and documents the collaboration-protocol update: future major DS work should receive technical persona review at Plan time and again before handoff.

## See also

- [Done](done.md)
- [Handoff Review](handoff-review.md)
- [CV22 index](../index.md)
- [CV22 Collaboration Strategy](../collaboration-strategy.md)
- [CV22 Refinement Campaign](../refinement/index.md)
- [Decisions](../../../decisions.md)
