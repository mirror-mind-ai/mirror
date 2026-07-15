[< Parent](../index.md)

# CV22.DS5.US1 — Fresh Embedding Search Parity

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a Mirror user,
I want semantic memory search with fresh query embeddings to run through the TS core,
So that the strangler no longer depends on Python for the full search path.

## Outcome

`memories --search` / semantic search uses TS for the fresh-query path with provider
safety, ranker reuse, access-count semantic parity, and appropriate reinforcement
write routing.

## Acceptance Behavior

```text
Given a configured external embedding provider
When I run semantic memory search through the front door
Then the fresh query embedding is obtained safely
And TS returns Python-compatible ranked results
And access/reinforcement behavior remains compatible
And secrets are not logged or committed
```

## Scope

- Provider-backed embedding retrieval through the DS5 boundary.
- Record/replay tests for embedding-dependent search.
- Access-count read strategy parity probe on a DB copy.
- Integration with the existing TS ranker.
- Reinforcement-write routing if it belongs to the completed search path.

## Out Of Scope

- Extraction and consult command parity.
- Schema custody transfer.

## Validation

Replay tests, copied-DB parity probes, and one optional live-provider smoke with
explicit credentials outside CI.
