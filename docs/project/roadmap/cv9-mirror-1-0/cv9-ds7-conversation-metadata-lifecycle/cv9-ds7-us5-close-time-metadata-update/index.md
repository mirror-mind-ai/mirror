# CV9.DS7.US5 — Close-time Metadata Update

**Type:** User Story  
**Status:** Planned  
**Parent:** [CV9.DS7 — Conversation Metadata Lifecycle](../index.md)

## Story

As a Mirror user, I want conversation metadata to be finalized when a session
closes so new conversations become useful in the web surface without manual
maintenance.

## Scope

- Run metadata lifecycle at the conversation close boundary.
- Use the `close_time` execution profile.
- Generate/apply safe title, summary, and tags.
- Preserve manual edits.
- Avoid applying low-confidence/refinement decisions unless the profile allows it.
- Record update source/evidence.

## Acceptance Behavior

```gherkin
Given a conversation has enough substance
When the conversation closes
Then Mirror updates missing or clearly improvable metadata
And preserves manual edits
And leaves unsafe refinements for explicit review
```
