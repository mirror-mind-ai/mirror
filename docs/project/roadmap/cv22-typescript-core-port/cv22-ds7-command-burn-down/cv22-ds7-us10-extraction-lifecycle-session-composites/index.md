[< Parent](../index.md)

# CV22.DS7.US10 — Extraction lifecycle: session composites & LLM-tail flips

**Status:** 🔵 In Progress — slices C′, B′, and D done; slice E half done
(paused 2026-09-03). Resume from [handoff.md](handoff.md).
**Type:** User Story
**Continues:** [CV22.DS7.US5](../cv22-ds7-us5-extraction-lifecycle/index.md)

---

## Why This Exists

US5 was planned as six slices. Slices A–C — the paths touching no provider —
landed and flipped as a coherent plateau. Slices D–F cluster around a different
risk profile: every one of them crosses `end_conversation`'s LLM close tail
(extraction plus close-time metadata finalization), which is config-gated
behind the DS5 replay transport and adjacent to the DS8 live seam. DS7 already
separates families by risk, so this split follows the story's own grain rather
than bundling two risk profiles under one validation claim.

Recorded as a Navigator-authorized scope change on 2026-09-02.

## User Story

As a Mirror user, I want the session-lifecycle composites, repair paths, and
backfills answered by the TypeScript core behind the replay transport,
So that the `conversation-logger` family reaches zero remaining deterministic
Python subcommands and the extraction lifecycle is fully burned down.

## Scope

- **Slice C remainder** — wire the driver's injected `runExtraction` to the DS5
  orchestration under the replay gate; the **prompt-assembly parity golden**
  and the **replay prompt-digest assertion** (the latter classed *blocking* by
  the DS7.US5 plan review, since replay resolves by role alone and would
  otherwise mask prompt drift); S13/S14 LLM-call ledger row parity.
- **Slice D** — `session-start [--fast]` and `session-maintenance`, including
  string-exact report parity across its timed steps.
- **Slice E** — `diagnose-journeys` / `repair-journeys` (the `--apply` path is
  a mutating repair and must be proven on copies with before/after assertions),
  `backfill-pi-sessions`, `backfill-codex-session`, and Python's session-less
  backfill-only path that US5's hook port deliberately left out.
- **Slice F** — the remaining routing flips: `switch`, `session-end-pi`, and
  the `session-end` hook, each only after its close tail is proven under
  replay.

## Inherited Blockers

- **`conversations append` routing** is blocked on the integer-valued-float
  metadata divergence (`1.0` vs `1`) recorded in US5's debt register; metadata
  bytes take part in the idempotency comparison, so it must be resolved before
  that flip.
- The **close tail** must run under the replay transport before any of
  `switch` / `session-end-pi` / `session-end` can flip; the live call remains
  DS8's.

## Acceptance Behavior

```text
Given a disposable Mirror home and the replay transport configured
When a full session lifecycle runs through the TS front door
  (session-start -> logging -> session-end -> budgeted extraction -> maintenance)
Then conversations, messages, memories, embeddings, and the LLM-call ledger
  match the Python oracle on the same starting copy
And the maintenance report is string-identical
And every remaining conversation-logger subcommand answers from TS
```

## Validation

Inherits US5's discipline: per-slice synthetic goldens, replay fixtures with
prompt digests, real-DB-copy write probes, hook-inclusive E2E, redaction, and
the seven-point flip checklist per subcommand. See the US5
[test-guide](../cv22-ds7-us5-extraction-lifecycle/test-guide.md) for the
established recipes.
