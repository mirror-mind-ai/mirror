[< Parent](../index.md)

# CV22.DS8.US3 — Long-tail cutover and gate consolidation

**Status:** ✅ Done — 2026-09-12. Eight leaves live and validated; the two scan leaves handed to [CV22.DS8.TS2](../index.md#why-ts2-exists-2026-09-11)
**Type:** User Story

---

## Outcome

The ten leaves still answering from Python in production — `consult
credits|ask`, `mirror load --query`, `consolidate scan|apply`, `shadow scan`,
`soul harvest save`, `journal`, `week plan`, `descriptor generate` — answer
from TypeScript against the live provider with no replay configuration and
no `MIRROR_TS_EXTERNAL_ROUTES`. The burn-down ledger's replay-gated table is
empty. Every provider-backed family resolves its transport through one
precedence and one provider factory, keeps a single-variable revert to
Python, and writes the `llm_calls` rows Python writes, priced.

## Story Statement

As the owner of a Mirror install,
I want every LLM- and embedding-crossing command to answer from the
TypeScript core against my real key, with the same ledger, the same
failure behavior, and a one-variable way back to Python,
So that the Python core has no production surface left in DS8's scope and
DS10 can delete it.

## Acceptance Behavior

```text
Given OPENROUTER_API_KEY set and no MIRROR_TS_* variable in the environment
When any of the ten leaves runs through the front door
Then it answers from TS, writes the ledger rows Python would write (priced,
    bodies withheld), and nothing that leaves the process contains the key

Given `consult` live
When the request leaves the client
Then it carries Python's two-message envelope (system, user), byte-identical

Given a half-configured two-fixture family, or a stale MIRROR_TS_EXTERNAL_ROUTES
When a leaf runs
Then it refuses by name / is unaffected, and no live call is made

Given MIRROR_TS_CONSULT=0, MIRROR_TS_MIRROR_QUERY=0, or MIRROR_TS_CULTIVATION=0
When the family's provider-crossing leaf runs
Then it routes to Python; the family's deterministic leaves stay on TS
```

## Scope

- Transport gaps the tail exposes: consult's message envelope, per-role
  timeout tier (reception), `getJson` + `LiveCreditProvider` with the
  `generation_id` URL boundary, and CR077's multi-fixture spec.
- Digest pins for `reception` and consult's preamble + envelope — a
  precondition for the consult/mirror flip — and the fix for reception's
  `$`-pattern corruption in prompt assembly; no prompt text changes.
  (`consolidation` and `shadow_scan` have no TypeScript template to pin;
  porting them is CV22.DS8.TS2.)
- One provider factory for every family; `loggerRuntime` migrates to it.
- Ledger parity for every flipped leaf, embeddings through
  `generateEmbeddingSafely` (CR075 and its adjacent cases); consult's
  `prompt` column bytes and cost fallback matched to Python; the
  `descriptor` gap **closed in TS** (decided, documented divergence).
- `soul harvest save` gets the provider it never had on the front-door path.
- A per-call outcome seam for the swallow-path leaves (`consolidate scan`,
  `shadow scan`, reception) and `calls=N` for fan-out leaves, surfaced in
  the front-door log.
- Route flips in three groups; `MIRROR_TS_EXTERNAL_ROUTES` retired; three
  new revert variables (`MIRROR_TS_CONSULT`, `MIRROR_TS_MIRROR_QUERY`,
  `MIRROR_TS_CULTIVATION` — tail-only, decided).
- Live long-tail smoke reading outcomes, not counts; ledger,
  configuration, README, and `decisions.md` updates.

## Out Of Scope

- CV22.DS8.TS1 (`eval`), CV22.DS8.TS2 (cultivation prompt templates),
  CR074, CR076, CR057.
- Prompt text changes; Python changes; budget guards (DS9); TS4's
  `inspect llm-calls`.

## Validation

See [Plan — Validation Route](plan.md#validation-route) and the
[Test Guide](test-guide.md). E2E required, staged by group.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Handoff](handoff.md)
