[< CV23](../index.md)

# CV23.DS2 — Linearizable Projection Publication Kernel

**Status:** ✅ Done

---

## Outcome

Every Core or extension publication for one registered Journey passes through one
secure filesystem kernel that validates authority and confinement, excludes other
processes, prevents stale-manifest lost updates, binds snapshot IDs to immutable
receipts, atomically publishes projection then manifest, and lets inspection
observe only a consistent pair or explicit divergence.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV23.DS2.TS1 | Confine paths and exclude Journey publishers | Technical Story | Registered-root path construction rejects escapes/symlinks and one cross-platform inter-process lock serializes each Journey | ✅ Done |
| CV23.DS2.TS2 | Publish with immutable receipts and rollback | Technical Story | Snapshot identity is create-once and controlled failures preserve or restore the previous public state | ✅ Done |
| CV23.DS2.TS3 | Merge manifests without lost updates | Technical Story | Manifest state is re-read and merged under lock; concurrent processes preserve unrelated entries and have one total order | ✅ Done |
| CV23.DS2.US1 | Inspect a consistent current projection | User Story | Inspection returns a validated manifest/document pair or bounded missing/divergence errors without repair or synthesis | ✅ Done |

## Done Condition

DS2 is done when real subprocess tests prove per-Journey linearizability,
inter-process exclusion, process-death lock recovery, stale-manifest lost-update
prevention, same-projection total ordering, immutable receipt behavior, consistent
inspection, path/symlink confinement, and every injected partial-publication
failure required by the CV23 verification guide.
