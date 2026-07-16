[< Parent](../index.md)

# CV22.DS5.US1 — Fresh Embedding Search Parity

**Status:** ✅ Done
**Type:** User Story

---

## User Story

As a Mirror user,
I want semantic memory search with a fresh query embedding to run through the TS core,
So that search can leave Python without changing ranking behavior or provider safety.

## Outcome

The TypeScript core can execute the fresh semantic search composition using a replayed embedding provider: load embedded memories, apply filters, compute lexical scores and grouped access counts, reuse the TS ranker, and log returned access on a DB copy. Runtime front-door cutover remains deferred to `CV22.DS5.US4`.

## Acceptance Behavior

```text
Given a database copy with embedded memories and access-log rows
And a replayed provider fixture for the query embedding
When TS fresh search runs with the same query, filters, ranker config, and frozen now as Python
Then the ordered result ids match the Python oracle
And returned memories receive access-log writes with context truncated to 200 chars
And no live provider call or credential is required in CI
```

## Scope

- Replay-backed embedding provider for fresh query vectors.
- TS search composition over the SQLite seam.
- FTS lexical ordinal scores.
- Grouped access-count strategy with parity evidence against per-id COUNT semantics.
- Access logging for returned results on DB copies.

## Out Of Scope

- Front-door route cutover for `memories --search`.
- Extraction and consult command parity.
- Live provider requirement in CI.
- Schema or ranker semantic changes.

## Validation

- Automated TS checks.
- Focused search/provider/parity tests.
- DB-copy fixture validation for ranking composition and access-log side effects.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
