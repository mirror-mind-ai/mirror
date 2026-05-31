[< CV9.DS7.US3](index.md)

# Plan — CV9.DS7.US3 Metadata Lifecycle Operation Report

## Roadmap Level

User Story inside [CV9.DS7 Conversation Metadata Lifecycle](../index.md).

## Acceptance Behavior

```text
Given a controlled fixture conversation and explicit metadata lifecycle apply values
When the Navigator runs the metadata lifecycle operation in preview or apply mode
Then Mirror reports changed and skipped fields in an inspectable operation report
And manual/user-edited title locks and refine_candidate decisions are not overwritten automatically
```

## Scope

- Add a Navigator-facing operation surface for metadata lifecycle decisions.
- Support preview/dry-run report and explicit apply report.
- Add a one-command controlled demo/fixture report that does not touch production data.
- Use the existing bounded apply service from CV9.DS7.TS3.
- Make changed and skipped fields visible in JSON output.
- Require explicit apply intent before mutation.
- Preserve manual title locks and skip `refine_candidate` automatically.

## Out of Scope

- Background/autonomous metadata mutation.
- Applying to production rows without explicit operator action.
- LLM title generation or replacement-title suggestion.
- Web console operation if CLI is sufficient for this story.
- Broad evidence filtering/ranking improvement.

## Proposed CLI Surface

Preview:

```bash
uv run python -m memory.cli.conversations \
  --metadata-lifecycle-dry-run <conversation-id>
```

Apply:

```bash
uv run python -m memory.cli.conversations \
  --metadata-lifecycle-apply <conversation-id> \
  --title "..." \
  --summary "..." \
  --tag metadata \
  --tag conversation
```

The apply command should print the service report as JSON.

Navigator-friendly demo:

```bash
uv run python -m memory.cli.conversations --metadata-lifecycle-demo
```

The demo should create controlled in-memory fixture conversations, run preview
and apply scenarios, and print one JSON operation report. It must not read from
or mutate production data.

## Validation Route

- Automated CLI tests for apply report output and mutation safety.
- Automated CLI test for one-command demo report.
- Navigator validation with one command: `uv run python -m memory.cli.conversations --metadata-lifecycle-demo`.
- Confirm `refine_candidate` title decisions are skipped.
- Confirm manual locks are preserved.
- Confirm report exposes preview/apply scenarios with `changed`, `skipped`, and `dry_run` sections.

## Documentation Impact

- Update US3 test guide.
- Update US2 status when US3 validates, because US2's Navigator-facing operation surface will then exist.

## Risks

- CLI apply can be dangerous if it appears safe for arbitrary production rows.
- Report must be explicit enough that skipped candidate decisions are not confused with failures.
- Mutation must remain opt-in and bounded.
