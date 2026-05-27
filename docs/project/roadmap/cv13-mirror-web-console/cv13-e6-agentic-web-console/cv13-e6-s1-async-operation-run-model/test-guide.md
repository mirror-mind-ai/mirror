[< Story](index.md)

# Test Guide — CV13.E6.S1 Async operation run model

## Automated validation

Run focused tests for the web operation service, persistence, and UI surfaces touched by the story. The exact test list should be updated during implementation, but validation should include:

```bash
uv run pytest tests -k "operation"
uv run ruff check .
node --check src/memory/web/static/app.js
```

If database migrations or schema helpers change, include the focused migration/schema tests used by the project for operation audit persistence.

## Behavioral checks

- Starting an allowed operation returns quickly with a `runId` rather than blocking until the operation completes.
- Unknown operation ids are rejected before any run is created.
- Invalid parameters are rejected before any run is created.
- The created run records operation id, sanitized parameters, status, timestamps, and selected Mirror home context.
- A run transitions through at least queued or running into completed for successful operations.
- Failed operations record failure status and error evidence without breaking the web server.
- Recent-run listing includes asynchronous runs with readable status.
- Fetching one run by id returns current status and final evidence when available.
- The Operations UI can start an operation, show that it is pending/running, and later show completion or failure evidence.
- Existing operation guardrails remain true: no arbitrary shell command, raw SQL, git mutation, `.env` mutation, or unvalidated operation input.

## Manual validation

Use the local web app against the personal Mirror or a safe test Mirror:

- Open the Operations surface.
- Start `runtime-health` and confirm the page receives a run quickly and then displays completed evidence.
- Start `database-backup` only if the target Mirror is safe for backup creation and confirm final backup evidence appears.
- Start conversation repair in dry-run mode and confirm no mutation happens while the run still records candidate evidence.
- Reload the page after starting or completing a run and confirm the recent run remains inspectable.

## Acceptance evidence

Record:

- Automated command results.
- Manual browser behavior.
- Any migration or compatibility notes for existing operation audit rows.
