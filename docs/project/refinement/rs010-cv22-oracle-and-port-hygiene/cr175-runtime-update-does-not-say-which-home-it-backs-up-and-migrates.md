[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR175 — `runtime update` does not say which home it backs up and migrates, and an inherited `MIRROR_USER` silently picks another

## Problem

On a package install, `runtime update` installs a new version for the whole machine, but
its backup, migrate, and post-update status steps act on one Mirror home: the one
`--mirror-home` names, else the one the environment names (`MIRROR_HOME`, `MIRROR_USER`),
where a variable the shell exported wins over the config file `~/.config/mirror/env`.
Neither the dry run nor the plan stage says which home that is, or where the choice came
from, before the backup runs.

On 2026-10-25 the production install was updated to v0.37.0 from a shell that exported
`MIRROR_USER=vinicius-dev`, inherited from a Pi session running the development
checkout; the config file names the production home, `vinicius`. The update backed up,
migrated, and checked the development home. The production home was left at 17
migrations, with no fresh backup, and the run reported success. Only the `Backup:` path
in its output showed which home it had used. The dry run before it reported the
development home's drift ("unknown core migrations: 018_drop_hook_injected") with nothing
to say whose drift it was, and it was read as the production home's.

## Expected Behavior

`runtime update` and `runtime update --dry-run` name the Mirror home they will back up
and migrate, and where that choice came from (`--mirror-home`, an environment variable,
or the config file), before the backup stage; and the status gate's drift line names the
home it describes.

## Impact

Medium on a machine with more than one home. Nothing is lost: the intended home migrates
on its next open, with its own pre-migration snapshot. But the operator believes a home
was backed up and migrated when another one was, and reads the drift the gate reports as
the wrong home's.

## Plan Or Decision

Captured, unassigned, 2026-10-25, from the v0.37.0 production update, at the Navigator's
direction. `--mirror-home` already exists on `runtime update`; the gap is that nothing
tells the operator they needed it. **Revisit:** the next change to the updater, or the
next release's production update.

## Evidence

The v0.37.0 entry in the [worklog](../../../process/worklog.md); the update's output,
whose `Backup:` line named `~/.mirror-minds/vinicius-dev/backups/`; the production home
then backed up and migrated by hand with `runtime migrate --mirror-home` and the variable
unset: ledger 17 before, 18 after, `018_drop_hook_injected` applied.

## Outcome

Pending: captured, not planned.
