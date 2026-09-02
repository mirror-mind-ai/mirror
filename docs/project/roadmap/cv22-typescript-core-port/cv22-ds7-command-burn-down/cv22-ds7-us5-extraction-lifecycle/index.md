[< Parent](../index.md)

# CV22.DS7.US5 — Extraction lifecycle

**Status:** 🔵 Planned — Plan authored, pending Navigator approval
**Type:** User Story
**Plan:** [plan.md](plan.md) · **Validation:** [test-guide.md](test-guide.md)

---

## User Story

As a Mirror user whose every conversation feeds durable memory,
I want the `conversation-logger` command family and the extraction lifecycle it
drives answered by the TypeScript core at proven parity,
So that the largest write orchestration in the product burns down from Python
without losing a message, a memory, a fence, or a budget guard.

## Outcome

`conversation-logger` subcommands (hooks, mute/status, switch, logging writes,
session lifecycle, maintenance, discard, diagnose/repair, backfills) and the
`conversations append` boundary route to TS per-subcommand as parity is proven;
the budgeted extraction driver runs the DS5 TS orchestration behind the replay
transport; live provider calls remain on the DS8 seam.

## Scope

- Slices A–F per [plan.md](plan.md): deterministic logger writes; the v0.31.13
  append boundary (owning the D-016 WAL read-only decision); the budgeted
  extraction driver; session composites; diagnose/repair + backfills;
  per-subcommand routing flips with required E2E smoke.

## Out Of Scope

- Live-provider cutover (DS8), MCP (DS9), web/package convergence (DS10),
  sibling DS7 stories, re-porting the DS5 extraction orchestration core,
  `journey_projections` and `journey_admin` backlog items (owners proposed in
  the plan, bound at their own pulls).

## Acceptance Behavior

```text
Given a disposable Mirror home with a real-shaped database copy
When the full conversation lifecycle runs through the TS front door under replay
Then conversations, messages, memories, and embeddings match the Python oracle
And unproven subcommands still reach Python fallback unchanged
And fences, budgets, idempotency, and failure isolation hold at parity
```

## Validation

Synthetic goldens per slice + replay fixtures + real-DB-copy probe families
(backup-gated, redacted) + oracle-baseline registration + per-subcommand
redaction test + required disposable-home E2E before any routing flip.
See [test-guide.md](test-guide.md).
