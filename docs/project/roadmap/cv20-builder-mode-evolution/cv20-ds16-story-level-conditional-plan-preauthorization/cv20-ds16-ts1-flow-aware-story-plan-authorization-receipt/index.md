[< CV20.DS16](../index.md)

# CV20.DS16.TS1 — Flow-Aware Story Plan Authorization Receipt

**Type:** Technical Story
**Status:** ✅ Done

## Outcome

The bounded Plan preauthorization receipt can represent one exact User Story or
Technical Story in `story_by_story` flow while preserving the existing aggregate
Delivery Story contract and payload-free persistence.

## Scope

- flow-aware receipt schema and compatibility;
- exact story structural fingerprint;
- story-safe serialization and coordinate invalidation;
- no invented child scope or prose comparison.

## Done Condition

US/TS receipts round-trip with bounded structural coordinates, old aggregate
receipts remain valid, coordinate changes invalidate conservatively, and no raw
request or Plan payload is persisted.
