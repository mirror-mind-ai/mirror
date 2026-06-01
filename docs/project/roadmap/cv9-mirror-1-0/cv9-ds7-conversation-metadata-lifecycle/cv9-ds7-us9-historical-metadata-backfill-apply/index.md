# CV9.DS7.US9 — Historical Metadata Backfill Apply

**Type:** User Story  
**Status:** Done  
**Parent:** [CV9.DS7 — Conversation Metadata Lifecycle](../index.md)

## Story

As a Mirror user, I want to apply reviewed metadata backfill to past
conversations so old conversations become useful in the web surface.

## Scope

- Apply reviewed backfill candidates.
- Support `safe` mode and `force` mode.
- In `force`, regenerate generated/provisional metadata for selected conversations.
- Preserve manual metadata by default.
- Produce changed/skipped evidence.
- Recommend or require backup before mutating batches.

## Acceptance Behavior

```gherkin
Given I previewed historical metadata backfill
When I apply the selected mode
Then Mirror updates only the allowed fields for selected conversations
And records changed/skipped evidence
And preserves manual edits unless an explicit future override exists
```
