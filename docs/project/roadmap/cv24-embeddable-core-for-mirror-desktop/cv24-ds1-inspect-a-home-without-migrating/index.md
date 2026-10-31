[< CV24](../index.md)

# CV24.DS1 — Inspect a Home Without Migrating

**Status:** 🟠 Implemented — branch `desktop/library-seam-1a`, from `main` at `dd5bed9b` (v0.37.0).
Not merged, not released.

## Outcome

A host imports `inspectMigrationState` from `mirror-mind/desktop` by package name, from its own
`node_modules`, with no Node flags. Given a database path, it learns one of five states:

- `missing`: no file;
- `not_mirror`: no readable `_migrations` ledger;
- `current`;
- `pending`: known migrations not applied, in order;
- `ahead`: the database has migrations this core does not know.

It also receives the applied, pending and unknown ids and the core's version. Nothing is migrated,
backed up or locked.

## What Changed

- **`ts/src/db/migrationReport.ts`** (new) holds the report. It shares `appliedMigrationIds`,
  `pendingMigrations` and `unknownMigrations` with `ensureMigratedOnOpen`. Those three were private
  and are now exported, with no behaviour change. So what the report calls pending is exactly what
  an open would apply, and its verdicts come in the open's order. A file that cannot be opened at
  all reads as `not_mirror`.
- **`bin/loader.js`** exports `registerTypeStripping()`, which is idempotent per package root. The
  warning filter moved into `boot()`, so a library import leaves the host's warning listeners alone.
  `registerHooks` still lives only in this file.
- **`lib/desktop.js`** (new) registers the hook, then imports the TypeScript dynamically and
  re-exports `inspectMigrationState` and `DESKTOP_API_VERSION = 1` by name. The import has to be
  dynamic because a static `export … from "./x.ts"` would load before the hook exists.
- **`package.json`** gains `exports` (`./desktop` and `./package.json`) and `lib` in `files`. The
  pack guard allows `lib/` and requires `lib/desktop.js`.
- **`scripts/smoke_npm_package.sh`**, step 7, imports the entry from the installed tarball through a
  host project.

## Measured

- **Before the work:** the core baseline was 3,527 tests, with 3,525 passing, 1 skipped and 1
  failing. The failure is `runtime/diagnose.test.ts`, "the two cores describe a broken index": on
  Node v24.6.0, `node:sqlite` allows a write to an FTS5 shadow table that the test expects it to
  refuse. That is a driver fact, outside this story.
- **A read-only open of a WAL database** leaves `memory.db` unchanged, but creates `-wal` and `-shm`
  and cannot remove them. The test allows exactly those two files and nothing else.
- **Isolation.** The Navigator's shell exports `MIRROR_HOME` and `MIRROR_USER` for a production
  home at migration 016. Every command in this story ran with those variables and `DB_PATH`,
  `MEMORY_DIR`, `MEMORY_PROD_DIR` and `MEMORY_ENV` unset, and with `HOME` and `TMPDIR` in a scratch
  directory. The production ledger was read before and after each run and stayed at 016.

## Evidence

- `ts/test/db/migrationReport.test.ts` has 10 tests. It covers:
  - the five states, with `pending` on a ledger at 016, which reports 017 and 018 in order;
  - `ahead` taking precedence over `pending`;
  - agreement with `ensureMigratedOnOpen`;
  - writes nothing: the same bytes, the same ledger, no backup and no lock;
  - `MIRROR_HOME`, `MIRROR_USER` and `DB_PATH` pointing at a canary are ignored;
  - the core version.

  It was red first, on the missing module.
- `ts/test/desktop/desktopEntry.test.ts` has 3 tests. It copies the shipped subset into a scratch
  project's `node_modules`, then checks:
  - the import by package name, with exactly two names exposed;
  - that the host's warning listener is kept;
  - that deep imports fail with `ERR_PACKAGE_PATH_NOT_EXPORTED` while `package.json` still resolves.
- **Mutations, each caught and then restored:**
  - the report calling `ensureMigratedOnOpen`: 2 failures;
  - `lib/desktop.js` without the hook registration: 2 failures in the suite, and 3 in the package
    smoke;
  - the report following `MIRROR_HOME`: 1 failure;
  - the warning filter installed at import: 1 failure.
- **Gates:**
  - typecheck: clean;
  - lint: clean, apart from 1 warning that was already in the baseline;
  - `npm test`: 3,540 tests, with 3,538 passing, 1 skipped and 1 failing (the baseline diagnose
    failure);
  - `scripts/smoke_npm_package.sh`: 81 checks passed, 0 failed.

## Exclusions

- No other library function. Those are DS2 to DS5.
- No release, no merge to `main`, and no change to `stable`.
- No fix for the diagnose test.
- No Mirror Desktop change. Desktop consumes this in its phase 2.
