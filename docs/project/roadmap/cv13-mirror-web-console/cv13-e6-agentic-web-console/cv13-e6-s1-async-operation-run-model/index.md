[< CV13.E6](../index.md)

# CV13.E6.S1 — Async operation run model

**Status:** ✅ Done
**Epic:** CV13.E6 — Async Operations and Agentic Web Console
**Release target:** v2.0

---

## User-visible outcome

When the user starts a web operation, the browser receives a run id immediately and can observe the operation as a durable run instead of waiting for all work to finish inside the original `POST` request.

---

## Scope

- Introduce an asynchronous run lifecycle for existing web operations.
- Keep the server-owned operation catalog and parameter validation from CV13.E5.
- Change operation start behavior so a request creates a run, persists initial state, and returns a `runId` quickly.
- Execute the operation outside the request cycle through a local worker path appropriate for the current web server architecture.
- Persist run status transitions such as queued, running, completed, failed, and cancelled or cancellation-requested if supported by the initial design.
- Preserve final result evidence and errors in the existing audit/history surface or a compatible successor table.
- Provide an API to inspect run state by id and list recent runs.
- Keep the existing Operations UI usable while reflecting the new asynchronous state.

---

## Non-goals

- No arbitrary shell command execution.
- No user-supplied command strings.
- No Pi/headless agent integration yet.
- No approval checkpoints yet.
- No full event timeline beyond the minimal status history needed to prove asynchronous execution.
- No requirement for SSE or WebSocket in this story; polling is acceptable.
- No runtime update, git mutation, extension install, or migration execution.

---

## Design notes

The core shift is from request-bound execution to run-bound execution:

```text
Before:
POST /api/operations/run -> execute operation -> return final result

After:
POST /api/operations/run -> create run -> return runId
worker executes operation -> run status/evidence updates
GET /api/operations/runs/:id -> inspect current state and final evidence
```

This story should avoid over-designing the final agent console. It only needs a small, reliable substrate that existing operations can use. The first implementation may use an in-process worker if that is the smallest safe step, provided the run is durable and the boundary does not depend on a long-lived HTTP request.

---

## Validation

See [test guide](test-guide.md).
