# CV9.DS7.US4 — Contextual Conversation Metadata Maintenance

**Type:** User Story  
**Status:** Active  
**Parent:** [CV9.DS7 — Conversation Metadata Lifecycle](../index.md)

## Story

As a Mirror operator, I want to run metadata lifecycle maintenance from a
conversation page so I can evaluate and apply safe conversation metadata updates
in context before Mirror automates that behavior.

## Scope

- Add a contextual web maintenance surface on the conversation detail page.
- Keep it separate from the batch Operations catalog.
- Support preview/dry-run for the current conversation.
- Support explicit apply with visible changed/skipped report.
- Add a separate CLI/debug route for temporal simulation at a message boundary.
- Do not expose message-level simulation in release UI.

## Acceptance Behavior

```gherkin
Given I am viewing a conversation in the web console
When I run metadata update
Then Mirror shows metadata lifecycle decisions for that conversation
And no mutation happens during preview

Given I reviewed the preview
When I apply explicit metadata values
Then Mirror updates only safe eligible fields
And shows changed and skipped fields
And preserves manual locks and refine candidates

Given I am debugging lifecycle timing
When I run the CLI preview-at-message command
Then Mirror reports what the lifecycle policy would decide using transcript messages up to that message
And the command does not mutate conversation metadata
```

## Notes

The web surface is release-safe conversation maintenance. The CLI temporal
simulation is developer/debug instrumentation and should not appear as a
per-message button in the product UI until a debug/admin mode exists.
