# CV9.DS7.US8 — Historical Metadata Backfill Preview

**Type:** User Story  
**Status:** Planned  
**Parent:** [CV9.DS7 — Conversation Metadata Lifecycle](../index.md)

## Story

As a Mirror user with past conversations, I want to preview metadata backfill
before mutation so I can see which conversations would receive title, summary,
and tag updates.

## Scope

- Preview conversations needing metadata work.
- Support `safe` and `force` preview modes.
- Include filters such as limit, journey, and date range if needed.
- Show per-conversation field decisions and expected actions.
- No mutation in preview.

## Acceptance Behavior

```gherkin
Given I have historical conversations
When I run metadata backfill preview
Then Mirror lists candidate conversations
And shows which fields would be created, repaired, regenerated, skipped, or preserved
And no conversation metadata changes
```
