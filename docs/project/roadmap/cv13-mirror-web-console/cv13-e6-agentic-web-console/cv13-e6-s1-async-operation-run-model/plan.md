[< Story](index.md)

# Plan — CV13.E6.S1 Async operation run model

## Intent

Move web operation execution out of the original `POST` response path while preserving the guarded operation contract created in CV13.E5. The user should start an operation, receive a run id quickly, and inspect that run as it moves through its lifecycle.

## Implementation outline

- Inspect the current operation registry, execution endpoint, run persistence, and Operations UI from CV13.E5.
- Extend the persistence model if the existing `operation_runs` table cannot represent queued/running lifecycle states cleanly.
- Add a run-start service that validates operation id and parameters, creates the initial run, and schedules execution.
- Add a minimal local execution worker path. Prefer the smallest architecture that avoids holding the original request open.
- Refactor existing operations to execute through the new run lifecycle without changing their safety boundaries.
- Add or adjust API routes so the browser can start a run, fetch one run by id, and list recent runs.
- Update the Operations UI so starting an operation shows pending/running/completed/failed state and final evidence after refresh or polling.
- Keep existing synchronous result evidence readable during the transition if needed for compatibility.

## Open design choices

- Whether to reuse `operation_runs` directly or add an `operation_run_events` table in this story.
- Whether the first worker is in-process, thread-backed, process-backed, or command-backed. This story should not introduce arbitrary shell execution.
- Whether cancellation appears only as a stored state placeholder here or waits until CV13.E6.S4.
- Whether polling is enough for this story. The default answer is yes unless implementation friction argues otherwise.

## Risks

- In-process workers may be simple but fragile across server restarts.
- A too-general executor could accidentally become browser shell access.
- UI polling can become noisy if not scoped to active runs.
- Existing tests may assume `POST /api/operations/run` returns final results immediately.

## Documentation impact

- Update CV13.E6 story status when complete.
- Update CV13 and worklog only after validation.
- Update REFERENCE only if public API behavior or operational commands change in a documented way.
