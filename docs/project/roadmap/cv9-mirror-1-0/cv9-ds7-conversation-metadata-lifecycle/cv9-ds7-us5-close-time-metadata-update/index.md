# CV9.DS7.US5 — Close-time Metadata Update

**Type:** User Story  
**Status:** Done  
**Parent:** [CV9.DS7 — Conversation Metadata Lifecycle](../index.md)

## Story

As a Mirror user, I want conversation metadata to be finalized when a session
closes so new conversations become useful in the web surface without manual
maintenance.

## Scope

- Run metadata lifecycle at the conversation close boundary.
- Treat close-time as finalization, not conservative maintenance.
- Regenerate missing, provisional, generated, or unlocked non-manual metadata from the full conversation.
- Preserve manual title, summary, and tags.
- Generate final title, summary, and tags when enough substance exists.
- Record update source/evidence as close-time metadata finalization.

## Acceptance Behavior

```gherkin
Given a conversation has enough substance
When the conversation closes
Then Mirror regenerates final non-manual title, summary, and tags from the full conversation
And preserves manual metadata
And records close-time finalization provenance
```
