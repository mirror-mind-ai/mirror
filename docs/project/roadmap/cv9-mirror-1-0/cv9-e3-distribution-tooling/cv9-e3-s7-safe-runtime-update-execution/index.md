[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S7 — Safe Runtime Update Execution

**Status:** ✅ Done  
**Epic:** CV9.E3 Distribution & Tooling

---

## User-Visible Outcome

A user can execute a Mirror runtime update with visible checks for every safety step, see where the backup was written, and receive a clear success or recovery report.

Expected shape:

```bash
uv run python -m memory runtime update
```

The update report should be explicit:

```text
Mirror runtime update

[✓] Status gate passed
[✓] Update plan ready: pull 2 commit(s)
[✓] Backup created: /Users/.../backups/memory_20260522_081445.zip
[✓] Backup verified
[✓] Git fast-forward completed: 71e84d3 → abc1234
[✓] Dependencies synced
[✓] Runtime status ready
[✓] Validation passed

Update result: success
```

Failure output should preserve the recovery path:

```text
[✓] Status gate passed
[✓] Backup created: /Users/.../memory_...
[✗] Git fast-forward failed

Recovery:
- Backup: /Users/.../memory_...
- Previous commit: 71e84d3
- Run: git reset --hard 71e84d3
- Restore database manually from the backup if needed.
```

---

## Problem

The self-update path now has all prerequisites: policy, status, health checks, dry-run, and backup/recovery. What remains is controlled mutation.

The update command must not hide what it is doing. It needs to show each gate and each side effect so the user can trust the operation and recover if something fails.

---

## Scope

In scope:

- Implement runtime update execution.
- Reuse status as the initial gate.
- Reuse dry-run plan before mutation.
- Create and verify a runtime backup before git changes.
- Show the backup path prominently.
- Apply git update with a conservative policy, likely fast-forward only.
- Record previous and final commit.
- Run post-update validation.
- Print checkmarked progress for every stage.
- Print recovery instructions on failure.

Out of scope:

- Automatic database restore.
- Automatic git rollback unless explicitly designed and approved in the story plan.
- Merge or rebase updates.
- Extension reinstall cleanup, unless it becomes required for correctness.
- Background or unattended updates.

---

## Policy Direction

The likely update policy is:

- the real update command may fetch because it is explicitly mutating;
- dry-run remains non-mutating and does not fetch;
- update execution accepts only fast-forward updates;
- ahead, diverged, dirty, or missing-upstream states block automatic execution;
- backup happens before code or database mutation;
- update is not considered successful until runtime status is ready again.

---

## Acceptance Criteria

- The update command blocks when runtime status is not ready.
- The update command blocks when dry-run plan is not safe.
- A backup is created and verified before mutation.
- The backup path is printed in success and failure output.
- Git update is conservative and does not merge or rebase automatically.
- Each update stage is rendered with a visible check, failure mark, or skipped state.
- Post-update validation runs and is visible.
- Failure output includes previous commit, backup path, and recovery instructions.
- Existing `status`, `backup`, and `update --dry-run` commands remain compatible.

---

## See also

- [CV9.E3.S3 Runtime Update Dry Run](../cv9-e3-s3-runtime-update-dry-run/index.md)
- [CV9.E3.S4 Runtime Backup and Recovery Prerequisite](../cv9-e3-s4-runtime-backup-recovery/index.md)
- [CV9.E3.S5 Runtime Version and Update Availability](../cv9-e3-s5-runtime-version-update-availability/index.md)
- [Command Reference](../../../../../../REFERENCE.md)
