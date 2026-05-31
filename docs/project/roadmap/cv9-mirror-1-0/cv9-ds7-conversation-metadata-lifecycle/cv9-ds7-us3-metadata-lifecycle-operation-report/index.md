[< CV9.DS7](../index.md)

# CV9.DS7.US3 — Metadata Lifecycle Operation Report

**Type:** User Story  
**Status:** Done  
**Parent:** [CV9.DS7 Conversation Metadata Lifecycle](../index.md)

---

## Intent

Expose the metadata lifecycle apply capability through a Navigator-facing
operation report so apply behavior can be validated as observable Delivery Work,
not only as an internal service contract.

---

## Acceptance Behavior Seed

```text
Given a controlled fixture conversation and explicit metadata lifecycle apply values
When the Navigator runs the metadata lifecycle operation in apply or preview mode
Then Mirror reports changed and skipped fields in an inspectable operation report
And manual/user-edited title locks and refine_candidate decisions are not overwritten automatically
```

---

## Candidate Surface

Possible CLI shape:

```bash
uv run python -m memory.cli.conversations \
  --metadata-lifecycle-apply <conversation-id> \
  --title "..." \
  --summary "..." \
  --tag metadata \
  --tag conversation
```

The final surface may be CLI, web operation, or both. It must be explicit and
bounded; no background/autonomous mutation is in scope.

---

## Pull State

Pulled after TS3 provided the internal bounded apply service. US3 exposes that capability through a Navigator-facing operation report, allowing US2 to close as observable behavior. US3 is done.

## Plan and Validation

- [Plan](plan.md)
- [Test Guide](test-guide.md)
