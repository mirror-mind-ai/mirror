[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S5 — Runtime Version and Update Availability

**Status:** ✅ Done  
**Epic:** CV9.E3 Distribution & Tooling

---

## User-Visible Outcome

A user can see which Mirror Mind version is installed, see that version when opening the Mirror, and know when an update is available before executing any update.

The runtime should make version state visible through an explicit command and through the normal opening surfaces.

Possible command shape:

```bash
uv run python -m memory version
uv run python -m memory runtime version
```

When an update is available, Mirror should show a natural prompt and a concrete command:

```text
Update available: Mirror Mind 0.7.1

Preview:
uv run python -m memory runtime update --dry-run

Update:
uv run python -m memory runtime update
```

---

## Problem

Mirror now has status, health checks, update dry-run, and backup/recovery prerequisite. But a user still does not have a clear product-level answer to:

- which version am I running?
- is this Mirror outdated?
- what version is available?
- what should I type or ask if I want to update?

Without this surface, self-update remains hidden behind operational commands. The user should not have to infer update availability from git state.

---

## Scope

In scope:

- Add an explicit Mirror version command.
- Decide whether the command is `memory version`, `memory runtime version`, or both.
- Show the installed version when opening the Mirror in the appropriate welcome/opening surface.
- Detect update availability using a safe, explicit source.
- Surface an update-available prompt with both natural wording and concrete commands.
- Keep update detection separate from update execution.
- Update command reference and roadmap docs.

Out of scope:

- Executing runtime updates.
- Creating backups.
- Applying migrations.
- Automatic update prompts that execute without explicit user action.
- Full release-note rendering.

---

## Open Design Questions

- Should version availability be based on GitHub releases, git tags, upstream branch state, package metadata, or a combination?
- Should checking availability contact the network automatically, or only when explicitly requested?
- Should opening the Mirror show only local version by default and update availability only when already known?
- Should `runtime status` include update availability, or should that remain in `version` and `update --dry-run`?

---

## Acceptance Criteria

- A user can run a command and see the current Mirror version.
- The opening Mirror surface displays the current version discreetly.
- Mirror can detect an available update without executing it.
- When an update is available, the user sees a natural prompt and copy-paste command.
- The update prompt points to dry-run before execution.
- Existing runtime status, backup, and dry-run behavior remains compatible.

---

## See also

- [CV9.E3.S3 Runtime Update Dry Run](../cv9-e3-s3-runtime-update-dry-run/index.md)
- [CV9.E3.S4 Runtime Backup and Recovery Prerequisite](../cv9-e3-s4-runtime-backup-recovery/index.md)
- [Command Reference](../../../../../../REFERENCE.md)
