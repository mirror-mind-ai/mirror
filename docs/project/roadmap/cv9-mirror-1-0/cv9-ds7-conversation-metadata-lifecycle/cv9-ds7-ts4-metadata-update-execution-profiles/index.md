# CV9.DS7.TS4 — Metadata Update Execution Profiles

**Type:** Technical Story  
**Status:** Planned  
**Parent:** [CV9.DS7 — Conversation Metadata Lifecycle](../index.md)

## Story

As the metadata lifecycle engine, I need explicit execution profiles so the same
field decisions can be applied differently in manual maintenance, historical
backfill, close-time automation, and active runtime contexts.

## Why This Is Technical

This is an internal policy boundary. The Navigator observes its effect through
US4, backfill, and runtime behavior, but TS4 is primarily validated by unit tests
and profile contract evidence.

## Scope

Define explicit profiles such as:

- `manual_safe` — report-driven web maintenance; conservative for review candidates.
- `backfill_safe` — batch fill/repair without overwriting protected/manual metadata.
- `backfill_force` — regenerate metadata for selected conversations, preserving manual locks by default.
- `close_time` — more willing than manual maintenance at the session boundary, but less destructive than force.
- `active_runtime` — conservative checks during ongoing conversations.

## Acceptance Behavior

- Profile rules are explicit and test-covered.
- `create`/`repair` handling is profile-specific.
- `refine_candidate` handling is profile-specific.
- Manual locks are preserved unless a future explicit override profile exists.
- Existing US4 manual maintenance behavior remains understandable and safe.
