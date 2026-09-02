[< Parent](../index.md)

# CV22.DS7.US5 — Extraction lifecycle: deterministic core

**Status:** 🔵 Implementation complete — pending Navigator validation
**Type:** User Story
**Plan:** [plan.md](plan.md) · **Validation:** [test-guide.md](test-guide.md)
**Continues in:** [CV22.DS7.US10](../cv22-ds7-us10-extraction-lifecycle-session-composites/index.md)

---

## Scope Change (2026-09-02, Navigator-authorized)

US5 was planned as six slices (A–F). Slices A–C proved to be a coherent,
shippable plateau — the paths that touch no provider — while D–F cluster around
the LLM close tail and its config-gated seams, a different risk profile that
DS7 elsewhere separates by family. Rather than let a partial claim close an
oversized story, US5 is re-scoped to **slices A–C** and D–F move to
**CV22.DS7.US10**.

## User Story

As a Mirror user whose every conversation feeds durable memory,
I want the deterministic core of the `conversation-logger` family — session
binding, message writes, the hook entries, the append boundary, and the
budgeted extraction driver — answered by the TypeScript core at proven parity,
So that the product's highest-volume write path burns down from Python without
losing a message, a fence, or a budget guard.

## Outcome

Seven `conversation-logger` subcommands answer from TS in production
(`mute`, `unmute`, `status`, `log-user`, `log-assistant`, `user-prompt`,
`discard-current`), reverted by one env var. The v0.31.13 `conversations
append` boundary and the budgeted extraction driver are ported and
oracle-registered, with their released spend and isolation properties pinned.

## Scope

- **Slice A** — deterministic logger core + runtime hook entries, flipped to TS
  with the seven-point checklist green.
- **Slice B** — the `conversations append` contract (validation, canonical
  metadata, RFC 3339 normalization, atomic idempotent storage), ported and
  oracle-registered; **not routed** (see Out Of Scope).
- **Slice C** — the budgeted extraction driver: eligibility, oldest-first
  ordering, AI-05 spend bound, CV9.E2.S7 per-conversation isolation, and the
  maintenance counters, with the model call injected.
- Two defects found in the Python authority and fixed there under the
  moving-target rule: hook entries ignoring `--mirror-home`, and
  version-dependent `createdAt` normalization.
- One live routing defect fixed: `conversations append` inheriting DS7.US1's
  listing route and silently discarding messages.

## Out Of Scope

- Session composites (`session-start`, `session-maintenance`), diagnose/repair,
  backfills, and the routing flips that depend on the LLM close tail — all
  **CV22.DS7.US10**.
- Routing `conversations append` to TS: blocked on the integer-valued-float
  metadata divergence recorded in the plan's debt register.
- Live-provider cutover (DS8), MCP (DS9), web/package convergence (DS10).

## Acceptance Behavior

```text
Given a disposable Mirror home with a real-shaped database copy
When the deterministic logger paths run through the TS front door
Then conversations, messages, titles, and metadata bytes match the Python
  oracle, and the slash command is logged by neither
And the seven flipped subcommands are reverted by
  MIRROR_TS_CONVERSATION_LOGGER=0 with no data migration
And the append boundary and extraction driver reproduce their released
  validation, idempotency, spend-bound, and isolation properties
```

## Validation

Synthetic goldens (state + stdout + edge cases), cross-language golden parity,
real-DB-copy write parity, hook-inclusive E2E on a disposable home, redaction,
revertibility, and the burn-down ledger entry. See [test-guide.md](test-guide.md).
