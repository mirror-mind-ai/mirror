[< CV13](../index.md)

# CV13.E6 — Async Operations and Agentic Web Console

**Status:** 🟢 In Progress
**Release target:** v2.0

---

## User-visible outcome

The web app can start controlled Mirror work as asynchronous, observable runs instead of blocking inside a web request. Users can launch allowlisted operations, watch progress and evidence accumulate, inspect history, cancel where possible, approve sensitive steps, and eventually launch a bounded local agent run on the same execution substrate.

---

## Motivation

CV13.E5 introduced the guarded Web Operations Runner: server-owned operation catalog, bounded parameters, dry-run/apply behavior, backup evidence, audit history, and a visible Operations surface. That foundation is intentionally synchronous-first. It proves the operation boundary, but it does not yet match the shape of long-running work.

The Agentic Web Console should not be introduced as a separate execution path. A headless agent run is a long-running, eventful, approval-sensitive operation. Before the agent enters the browser, the existing operation model should learn the capabilities the agent will require: asynchronous runs, event logs, streamed or polled progress, controlled command execution, cancellation semantics, approval checkpoints, durable evidence, and clear failure states.

This epic therefore evolves operations from request-bound execution into a local job/run model. The agent becomes a later special case of the same safe operating surface, not a privileged bypass around it.

---

## Stories

| Code | Story | User-visible outcome | Status |
|------|-------|----------------------|--------|
| [CV13.E6.S1](cv13-e6-s1-async-operation-run-model/index.md) | Async operation run model | Starting an operation creates a durable run and returns immediately while execution proceeds outside the request cycle | ✅ Done |
| [CV13.E6.S2](cv13-e6-s2-operation-event-log-and-timeline/index.md) | Operation event log and timeline | The user can inspect incremental run events and evidence in a browser timeline, initially through polling if streaming is not yet necessary | ✅ Done |
| [CV13.E6.S3](cv13-e6-s3-controlled-command-executor/index.md) | Controlled command executor | Allowlisted operations can execute through a command-like runner with fixed commands, validated parameters, timeout, cwd, sanitized environment, and captured output | ✅ Done |
| [CV13.E6.S4](cv13-e6-s4-cancellation-and-failure-semantics/index.md) | Cancellation and failure semantics | Long-running operations expose cancellation where supported and preserve partial evidence for cancelled, failed, and timed-out runs | ✅ Done |
| CV13.E6.S5 | Approval checkpoint model | Sensitive runs can pause before persistent writes, present a proposal or evidence, and continue only after explicit approval | ⚪ Future |
| CV13.E6.S6 | Agent run prototype | The web app can launch a bounded local agent run as an allowlisted operation using the same run, event, approval, and evidence model | ⚪ Future |

---

## Guardrails

- No arbitrary shell command execution from browser input.
- No user-supplied command strings.
- Commands must be server-owned, allowlisted, and parameterized through operation schemas.
- The command-like executor must control working directory, environment, timeout, output capture, and secret redaction.
- Asynchronous execution must preserve local-first boundaries and use the selected Mirror home explicitly.
- A run must be durable enough to inspect after page reload or process failure where feasible.
- Mutating operations must keep dry-run and approval semantics explicit.
- Agent runs must use the same capability boundary as operations, not direct database, file, git, or shell access.

---

## Non-goals

- No general-purpose terminal in the browser.
- No remote web serving or multi-user web auth model.
- No unconstrained Pi or agent subprocess with raw filesystem access.
- No automatic runtime update, git mutation, extension install, or migration execution unless introduced later as explicit allowlisted operations with recovery paths.
- No requirement to introduce SSE/WebSocket before the run model and event storage justify it.

---

## Relationship to CV13.E5

CV13.E5 remains the synchronous-first release of the Operations Runner. CV13.E6 starts by preserving the same operation catalog and audit boundary while changing execution shape from request-bound to run-bound.

Existing operations should continue to work from the user's perspective. Internally, they should migrate toward creating runs, emitting events, and recording final evidence through the same audit model.

---

## See also

- [CV13.E5 Web Operations Runner](../cv13-e5-web-operations-runner/index.md)
- [Agentic Web Console envisioning](../../../../product/envisioning/agentic-web-console.md)
