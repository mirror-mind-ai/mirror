[< CV13.E6](../index.md)

# CV13.E6.S4 — Cancellation and failure semantics

**Status:** ✅ Done
**Epic:** CV13.E6 — Async Operations and Agentic Web Console
**Release target:** v2.0

---

## User-visible outcome

The user can request cancellation for an active operation run and failed or cancelled runs preserve clear status, event evidence, and partial context.

---

## Scope

- Add cancellation-requested and cancelled lifecycle states.
- Expose a guarded cancellation endpoint for operation runs.
- Record cancellation events in the durable run timeline.
- Keep cancellation cooperative and explicit: S4 does not forcibly kill running Python work.
- Preserve existing failure events and result evidence.

---

## Non-goals

- No process kill or hard thread interruption.
- No approval checkpoints.
- No agent execution.
- No arbitrary command input.

---

## Validation

Focused web/service tests plus ruff, node syntax, and diff checks.
