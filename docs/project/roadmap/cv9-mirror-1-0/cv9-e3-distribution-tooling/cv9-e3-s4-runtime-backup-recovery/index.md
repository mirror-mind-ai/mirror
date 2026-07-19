[< CV9.E3 Distribution & Tooling](../index.md)

# CV9.E3.S4 — Runtime Backup and Recovery Prerequisite

**Status:** ✅ Done  
**Epic:** CV9.E3 Distribution & Tooling

---

## User-Visible Outcome

Before Mirror can execute a self-update, it has an explicit backup and recovery prerequisite that can be run, verified, and explained independently.

A future update command should not be the first place where backup semantics are tested. This story makes backup/recovery a first-class runtime readiness capability.

---

## Problem

Mirror already has a `memory backup` command, and runtime dry-run now says a backup is required before real update. But the self-update path needs a stronger contract than "a zip was written somewhere".

A runtime update may touch code, dependencies, database migrations, and installed extensions. Before execution exists, Mirror needs to answer:

- what exactly is backed up;
- where the backup is written;
- whether the backup can be inspected;
- what a recovery route would be if an update fails;
- what is intentionally not restored automatically.

Without this story, the real update story would mix three risks at once: backup, mutation, and recovery.

---

## Scope

In scope:

- Define the runtime backup contract for self-update.
- Add or adapt a runtime-facing backup prerequisite command if needed.
- Ensure backup output includes the database and SQLite sidecars when present.
- Report backup path, archive contents, and recovery instructions.
- Add verification helpers that inspect a backup archive without restoring it.
- Document the manual recovery route for the current release.
- Cover the behavior with isolated tests.

Out of scope:

- Automatic restore.
- Git rollback.
- Running runtime update execution.
- Applying or rolling back migrations.
- Backing up the entire git checkout.
- Backing up extension source repositories outside the Mirror home.

---

## Acceptance Criteria

- Runtime self-update has a documented backup prerequisite.
- A backup can be created from an explicit `--mirror-home` without touching production accidentally in tests.
- Backup verification can confirm that `memory.db` is present in the zip.
- WAL and SHM sidecars are included when present.
- A missing database fails clearly and does not create an empty backup directory.
- The command or docs state the recovery route: stop runtime use, replace `memory.db` and sidecars from the zip, then rerun runtime status.
- The recovery route is manual in this story and explicitly not automatic.
- Existing `memory backup` behavior remains compatible.

---

## See also

- [CV9.E3.S3 Runtime Update Dry Run](../cv9-e3-s3-runtime-update-dry-run/index.md)
- [Command Reference](../../../../../../REFERENCE.md)
- [Development Guide](../../../../../process/development-guide.md)
