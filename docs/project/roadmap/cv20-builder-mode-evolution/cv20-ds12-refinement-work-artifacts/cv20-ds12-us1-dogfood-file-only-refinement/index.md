[< CV20.DS12](../index.md)

# CV20.DS12.US1 — Dogfood File-Only Refinement

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

The Navigator resumes real Refinement Work from `docs/project/refinement/index.md`,
selects CR001, and records a concrete plan using files alone. The exercise measures the
document contract before any automation is proposed.

## Acceptance Behavior

```text
Given the canonical Workbench has no current focus and CR001 is the first open item
When the Navigator selects and plans CR001
Then RS001 and CR001 become the explicit current focus
And their canonical statuses change only in the root index
And CR001 gains a bounded plan without being implemented
And the remaining backlog stays visible and unchanged
```

## Scope

- Update root focus to RS001 and CR001.
- Change RS001 from `proposed` to `active`.
- Change CR001 from `captured` to `planned`.
- Add a reproduction-first implementation plan to the CR001 document.
- Record friction observed while making and reading those changes.

## Out Of Scope

- Implementing CR001.
- Changing CR002 or CR003 status or narrative.
- Adding a parser, CLI, database projection, synchronization, or automatic transition.
- Reading or writing SQLite to complete the exercise.
- Migrating the CV20.DS6 Workbench.

## Validation

A file-only reading must identify RS001/CR001 as the focus, CR001 as planned, CR002 as
the next captured item, CR003 as done, and the CR001 implementation boundary.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
