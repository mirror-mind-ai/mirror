[< Parent](../index.md)

# CV22.DS7.US4 — Mirror Mode Orchestration

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

The TypeScript front door answers the core deterministic `mirror` and `mode` command
families with Python-compatible context composition, session state, rendered output, and
database transitions. LLM-assisted reception runs through the replay-safe `LlmTransport`;
live reception remains on Python until CV22.DS8. When a matching installed extension
context binding could contribute, the command preserves behavior through an explicit
Python fallback owned for removal by [CV22.DS7.TS2](../cv22-ds7-ts2-extension-context-provider-runtime-convergence/index.md).

## Story Statement

As a Mirror runtime user,
I want Mirror Mode activation, routing, context loading, response logging, and explicit
operating-mode state to run through the TypeScript core,
so that an ordinary extension-free Mirror turn no longer depends on Python while preserving
the same selected-journey isolation and visible behavior.

## Acceptance Behavior

```text
Given a configured Mirror home and optional runtime session
When mirror load/deactivate/log/journeys or mode activate/deactivate/status runs
Then the TypeScript core reproduces Python stdout, stderr, exit status, context order,
     session/global state, sticky defaults, conversation binding, and logging effects
And reception uses replay only, failing soft to the established deterministic fallbacks
And a selected journey loads only that journey, never ancestors or descendants
And live-provider conditions remain explicitly routed to Python
And a matching installed extension context binding triggers an explicit Python fallback
    instead of silently losing extension-provided context
```

## Scope

- Port `mirror load`, `mirror deactivate`, `mirror log`, and `mirror journeys`.
- Port `mode activate`, `mode deactivate`, and `mode status`.
- Preserve explicit → reception → sticky → keyword-detection routing priority.
- Port core Mirror context composition: identity gating, persona, knowledge, organization,
  selected journey, shadow gating, and relevant attachments.
- Detect whether matching installed extension context bindings could affect `mirror load`
  and preserve an explicit, independently testable Python fallback in that case.
- Preserve session-scoped Mirror state, hook-injection flags, global compatibility rows,
  conversation binding, mute-aware assistant logging, and summary-derived titles.
- Add a replay `reception` role and narrowly named front-door route gates; DS8 retains live
  provider ownership and TS2 retains extension-provider convergence ownership.
- Freeze Python oracle behavior, committed redacted fixtures, exact render goldens,
  copy-based database-transition parity, and a front-door E2E smoke before routing flips.

## Out Of Scope

- Executing installed extension context providers in TypeScript or defining their migration
  contract; that is CV22.DS7.TS2.
- Generating the assistant's answer inside the core; runtimes remain responsible for it.
- Live LLM/provider cutover, retries, production secrets, or paid smoke calls (DS8).
- Conversation extraction, embeddings, maintenance extraction, or lifecycle backfill (US5).
- Soul, Explorer, Builder/Ariad, Workspace/web, or ops/utility command families.
- Journey inheritance or ancestral context composition.
- Schema changes, Python deletion, npm distribution, or redesign of Mirror semantics.

## Validation

- Exact unit and golden parity for every command branch and rendered surface.
- Replay fixtures for successful, malformed, missing-field, and provider-failure reception.
- Database-copy parity for runtime-session, conversation, message, sticky-default, and
  operating-mode transitions.
- Front-door routing/redaction tests proving deterministic/replay cases use TS, live
  reception stays on Python, and matching extension bindings use the named fallback.
- E2E: run `mode status → mirror load → mirror log → mirror deactivate → mode status`
  against a disposable extension-free Mirror home/session and compare observable output
  and stored state with the Python oracle.
- Compatibility smoke: add a synthetic matching extension binding and prove the full
  `mirror load` command remains on Python with no lost context.
- Navigator validation: activate Mirror Mode on the disposable fixture with an explicit
  journey/query and confirm the transition surface, selected context, logging, and
  deactivation behavior are unchanged.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Review](review.md)
- [Done](done.md)
