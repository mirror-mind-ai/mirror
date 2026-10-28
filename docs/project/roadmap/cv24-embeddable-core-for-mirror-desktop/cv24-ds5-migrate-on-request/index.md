[< CV24](../index.md)

# CV24.DS5 — Migrate on Request

**Status:** 🟡 Planned (2026-10-28). One decision is the Navigator's: **backup custody**, below.
Nothing is built until it is answered.

## Outcome

A host migrates a home only when the person has been asked, through one explicit call:

**`migrateHome(dbPath, { expectedPending })`** applies the pending migrations and returns a receipt:
`{ appliedIds, backup: { path, sha256, sizeBytes }, before, after }`. `before` and `after` are DS1
reports.

It applies exactly what the host showed the person. `expectedPending` is the `pending` list from
the report the host displayed. If the home's pending set has changed since then, the call refuses
and changes nothing. That can happen when another process migrated the home, or when a different
core version is now running.

DS1 to DS4 refuse every home that is not `current`. With this call, the phase 1 contract is
complete: report, ask, migrate, then use.

## Measured Before Planning

- **The machinery exists.** `ensureMigratedOnOpen` takes the bootstrap lock, re-reads the ledger
  under it, takes a backup, runs `runMigrations` and `createSchema`, and releases the lock. It
  declines a database with no ledger and a database that is `ahead`.
- **Its backup has two gaps that matter for phase 5,** where this call meets the Navigator's
  production home:
  1. **One fixed name, overwritten.** `takeBackup` removes
     `backups/frontdoor-pre-migration-backup.db` and writes a new one. The next migration of the
     same home destroys the previous pre-image.
  2. **Unverified.** The snapshot is written with `VACUUM INTO` and used as-is. Nobody runs
     `quick_check` on it, nobody records its hash, and nobody converts it to WAL so that it restores
     as the database it was taken from. `prepareArchiveSnapshot` (CR061) does exactly this for
     `runtime backup --verify`, but the migration path never calls it.
- **The cost.** One `VACUUM INTO` of the 108 MB production home measured about 0.9 s. A migration is
  rare and the person has just been asked, so the cost is acceptable once.

## The Decision: Backup Custody

**Recommended: a verified, retained backup, required before any migration.**

- **A unique name that is never overwritten:**
  `backups/pre-migration-<last applied id>-<UTC timestamp>-<random>.db`, owner-only.
- **Verified before anything changes.** The call runs `prepareArchiveSnapshot`, which converts the
  backup to WAL and runs `quick_check`. It then records the backup's SHA-256 and size, and opens the
  backup to confirm that DS1 reads the same `pending` list as the live database. That makes the
  backup a true pre-image. If any of this fails, the call refuses, nothing is migrated, and the
  failed backup file is removed.
- **Retained.** The core never deletes these backups. They stay until the person or the host removes
  them.
- **Under the lock throughout.** The lock is held from the ledger re-read to the last migration
  statement, as `ensureMigratedOnOpen` already does.

If chosen, it is recorded in `docs/project/decisions.md` before any code. `ensureMigratedOnOpen`, the
CLI's path, stays as it is, and changing the CLI's backup is not part of this story.

**The alternative** is to call `ensureMigratedOnOpen` as it is. It is quicker to build, but it brings
both gaps into the call that phase 5 will run against production.

## Refusals

`migrateHome` throws `MigrateHomeRejectedError` with one of these reasons:

- `nothing_pending`: the home is already `current`;
- `pending_changed`: the actual pending set differs from `expectedPending`;
- `not_migratable`: the home is `missing`, `not_mirror` or `ahead`;
- `backup_failed`: the backup could not be written, verified or confirmed as a pre-image.

## Acceptance

- **A home at 016** migrates to `current` and applies `017` then `018`. The receipt's `before` reads
  `pending` and its `after` reads `current`. DS2 and DS3 then accept the home.
- **The backup is a true pre-image:**
  - it exists under the unique name, mode 0600;
  - its SHA-256 matches the receipt;
  - `quick_check` reads `ok`, and its header records WAL;
  - DS1 reads it as `pending` with `017` and `018`;
  - its `identity`, `conversations` and `messages` row counts equal the home's before migration.
- **Retained.** Two migrations of two homes in the same directory leave two backups. A second
  migration of the same home, after a forced regression, leaves both backups.
- **Every refusal changes nothing:** the home's bytes are unchanged and no backup file remains. A
  `backup_failed` is forced in the test by making the backup directory unwritable.
- **The lock.** A concurrent `migrateHome` on the same home applies once, and the other call refuses
  with `nothing_pending` or waits and then refuses. Either way, there is one backup and one migration.
- **No environment.** `MIRROR_HOME` aimed at a canary is ignored.
- **The installed entry.** Step 7 of the package smoke migrates a scratch home at 016 from the
  tarball, then records a Conversation in it.
- **Mutation controls.** Each of these fails a test:
  - ignoring `expectedPending`;
  - skipping `quick_check`;
  - reusing the fixed backup name;
  - migrating before the backup is verified.

## Exclusions

- **Restoring from a backup.** It overwrites a live home, so it is destructive and gets a story and
  a decision of its own. Phase 5's rehearsal needs it.
- **Deleting or rotating backups.**
- **Any change to `ensureMigratedOnOpen` or to the CLI.**
- **Running against the production home.** That is DS-005 phase 5, at the Navigator's word.
- No release.

## Validation

- typecheck, lint, `npm test` against DS4's baseline (3,573 passing, plus the local-only diagnose
  failure), and the package smoke;
- every new file committed before the final local run;
- Core CI dispatched on the branch;
- DS1's isolation, with the production ledger read before and after.
