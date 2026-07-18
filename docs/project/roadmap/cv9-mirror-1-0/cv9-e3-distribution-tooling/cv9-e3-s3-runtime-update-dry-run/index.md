[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S3 — Runtime Update Dry Run

**Status:** ✅ Done  
**Epic:** CV9.E3 Distribution & Tooling

---

## User-Visible Outcome

A user can ask Mirror what a runtime self-update would do before allowing any mutation.

```bash
uv run python -m memory runtime update --dry-run
```

The command produces a concrete plan: whether the local runtime is safe to update, what repository branch and upstream it would use, whether local commits or remote commits exist, whether database backup is required, and which validation commands should run after update.

No files, database rows, git refs, or installed extensions are changed.

---

## Problem

Mirror now has a current-state diagnostic surface, but self-update still has no planning step. Jumping directly from status to an actual update would violate the Ariad coherent update policy: operational updates need current state, target, plan, backup or recovery route, execution, validation, rollback or repair route, and history.

The next missing piece is the plan. A dry-run is the bridge between diagnosis and execution.

---

## Scope

In scope:

- Add `memory runtime update --dry-run`.
- Reuse `runtime status` as the safety gate.
- Inspect git upstream relationship without fetching or mutating refs.
- Report whether the local branch is ahead, behind, diverged, clean, or not updateable.
- Report backup and validation steps that a real update would require.
- Exit zero only when an update could be planned safely.
- Cover behavior with unit tests.
- Update command reference and roadmap docs.

Out of scope:

- Pulling, fetching, merging, rebasing, or checking out code.
- Creating backups.
- Running migrations.
- Updating extensions.
- Rollback implementation.
- JSON output.

---

## Acceptance Criteria

- `runtime update --dry-run` never mutates the repo or database.
- A dirty git tree blocks the dry-run with an actionable reason.
- Missing mirror home, missing database, missing migrations, or unhealthy extensions block the dry-run.
- A clean branch behind upstream reports that a real update would pull remote commits.
- A clean branch already equal to upstream reports no runtime code update needed.
- A branch ahead of upstream reports local commits and refuses automatic update planning.
- A diverged branch reports divergence and refuses automatic update planning.
- A branch without upstream reports that no update target is configured.
- Output includes backup and validation steps for the future real update path.
- Existing `runtime status` behavior is preserved.

---

## See also

- [CV9.E3.S2 Runtime Status Health Checks](../cv9-e3-s2-runtime-status-health/index.md)
- [Command Reference](../../../../../../REFERENCE.md)
- [Development Guide](../../../../../process/development-guide.md)
