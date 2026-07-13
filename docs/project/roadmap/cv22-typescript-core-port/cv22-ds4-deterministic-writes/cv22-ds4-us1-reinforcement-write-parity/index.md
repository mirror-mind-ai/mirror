[< Parent](../index.md)

# CV22.DS4.US1 — Reinforcement Write Parity (`log_access`)

**Status:** ✅ Done
**Type:** User Story
**Depends on:** [CV22.DS4.TS1 Write Parity Harness & Backup Gate](../cv22-ds4-ts1-write-parity-harness/index.md)

---

## User Story

As Mirror, when a memory is accessed or explicitly referenced, I want the
TypeScript core to record that access (`log_access`) and reference
(`increment_use_count`) exactly as the Python core does, so the honest-
reinforcement signals the ranker already reads stay identical once the write path
moves to TS.

## Outcome

`log_access` and `increment_use_count` (`src/memory/storage/memories.py`) are
ported to the TS seam. Applying them through the TS core produces the same mutated
rows as the Python oracle — `last_accessed_at` stamped with the frozen `now`,
`use_count` incremented by exactly one — proven by state-diff on a copy of
`memory.db`. The Pi front door routes reinforcement writes to TS.

## Acceptance Behavior

```text
Given a seeded memory.db copy and a frozen now
When log_access(memory_id) and increment_use_count(memory_id) run through the TS core
     and through the Python oracle on parallel copies of the same seed
Then the mutated rows are equal: last_accessed_at == frozen now, use_count incremented by exactly 1
And no other row or column changes in either database
```

## Scope

- Port `log_access` — `UPDATE memories SET last_accessed_at = ? WHERE id = ?` — to
  the TS seam.
- Port `increment_use_count` — `UPDATE memories SET use_count = use_count + 1 WHERE id = ?`.
- Prove state-diff parity on a `memory.db` copy under a frozen `now`, via the
  DS4.TS1 harness.
- Route reinforcement writes through the Pi front door to TS; Python fallback
  intact for everything unported.

## Out Of Scope

- Journey and identity writes (CV22.DS4.US2 / US3).
- Memory creation, extraction, embeddings (CV22.DS5).
- Any schema or FTS5 change.

## Validation

Reinforcement state-diff probe in the DS4.TS1 write harness (copy-only, redacted
evidence), plus a front-door smoke confirming a reinforcement write lands through
TS with the Python fallback still intact.
