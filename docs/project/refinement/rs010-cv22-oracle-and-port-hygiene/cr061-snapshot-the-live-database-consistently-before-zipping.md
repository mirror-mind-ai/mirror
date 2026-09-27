[< RS010](index.md)

# CR061 — Snapshot the live database consistently before zipping

**Status:** validated
**RS:** RS010
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

## Problem

### As captured (2026-09-08)

`backup` archives `memory.db` plus its `-wal`/`-shm` sidecars by raw file
copy, with no read lock. The Pi extension runs it at session shutdown while a
detached `session-maintenance` process (spawned by `runPyBackground` at
session start) may still be writing: extraction inserts memories,
embeddings, and ledger rows. A torn snapshot — main file and WAL captured at
different instants — is a plausible restore image that SQLite may refuse or
silently roll back. The Navigator's 2026-09-08 validation archive carried a
210 KB live WAL, which is the situation in question. CV22.DS7.TS1 reproduced
the raw copy for parity (`ts/src/backup/zipBackup.ts`, `collectEntries`).

The front door's own pre-write snapshot already does this correctly:
`liveBackup.ts` uses `VACUUM INTO` (see `snapshotDatabaseTo`), which is
WAL-correct.

### As characterized (2026-09-27)

Measured on `0c3126f0` in scratch homes, and once, read-only, against a
snapshot of the real database. This document carries the plan for CR061,
[CR062](cr062-write-backup-archives-owner-only.md), and
[CR060](cr060-fail-loudly-when-a-silent-backup-fails.md), one delivery with one
validation route by the Navigator's decision.

**The race loses data silently.** `collectEntries` reads the main file and then
the WAL, with nothing between them. With 500 rows committed only in the WAL and
a checkpoint between the two reads, which any connection may run, maintenance
included, the pair restores 0 of the 500 rows and `PRAGMA quick_check` reports
`ok`. Nothing downstream can tell.

**Even without the race, the archive's `memory.db` is not the data.** With 500
rows committed only in the WAL and the writer still open, `backup --silent`
exits 0 with three members. The `memory.db` member on its own holds 0 of the
rows and passes `quick_check`. The updater's verifier (`verifyBackupArchive`,
`ts/src/runtime/backup.ts`) checks exactly that member and reports the archive
`valid`. The rows exist only in the `-wal` member, which was copied at another
instant. So the verdict the updater relies on before it moves the tree is true
of a file that does not hold the data.

**Five callers share the defect.** `createZipBackup` makes the archive for
`backup` (the session-end backup in every runtime, and `/mm-backup`), for
`repair-encoding --apply`'s gate, for the conversation logger's backup, for
`runtime backup`, and for the updater's backup stage. One change fixes all
five.

**The snapshot needs three things the pre-write snapshot does not.**
`snapshotDatabaseTo` is WAL-correct and already runs on every routed write.
Measured with SQLite 3.53.0 on Node 25.9:

- `VACUUM INTO` accepts a pre-created empty target, and a target created empty
  with mode 0600 stays 0600. Otherwise the snapshot takes the process umask.
- The snapshot comes out in rollback-journal mode: header bytes 18 and 19 are 1
  and 1. Mirror sets WAL only when bootstrap creates a missing file
  (`ensureWalMode`, `ts/src/db/bootstrap.ts`), so a restored snapshot would run
  in rollback-journal mode for good. Switching the snapshot to WAL and closing
  it leaves one self-contained file with a WAL header (2 and 2) and no sidecars,
  and that file reopens in WAL mode with every row.
- On a snapshot of the real 58 MB database, `VACUUM INTO` took 325 ms,
  `quick_check` 26 ms, and deflate 1,504 ms. The deflate cost exists today, so
  the snapshot and the check add about 0.35 s at session end.

**On the Navigator's install the backups directory is a Dropbox folder.**
`<home>/backups` is a symlink to `~/Dropbox/Projetos/MirrorMind/vinicius-ts/backups`,
a 0755 folder holding 58 dated archives at 0644 beside the front door's two
0600 snapshots. The Mirror home itself is 0700. A snapshot staged in that
folder would be uploaded and deleted at every session end.

**The modes and the silence are as captured.** Under umask 022 the zip backup
writes its archive 0644. It creates its directory 0755 unless the pre-write
snapshot created it first, at 0700. `backup --silent` exits 0 with no output
when the database is missing, and also when no Mirror home resolves
(`runBackupRoute`: `if (dbPath === null) return silent ? 0 : 1`). A thrown
failure already exits 1, but as an uncaught stack trace.

**The test oracle cannot grade a snapshot.** The golden's fixture `memory.db` is
a real SQLite header followed by the bytes 0 to 255. It was built to grade a raw
copy, and `VACUUM INTO` cannot read it. A snapshot's bytes also depend on the
SQLite build, which differs between CI (Node 24) and this machine (Node 25.9),
so a frozen member CRC would fail somewhere. The golden's Python oracle is gone
(TS5).

**The recorded posture limits what the fix may touch.** REFERENCE.md's security
posture enforces owner-only modes where Mirror creates something, and
`runtime diagnose` reports drift. It also says that "pre-existing directories
are never mutated". The Dropbox folder above is the case that rule exists for.

## Expected Behavior

The archive member `memory.db` is a consistent snapshot produced through
SQLite (`VACUUM INTO` or the online backup API) and the `-wal`/`-shm`
members disappear, because a vacuumed snapshot has no sidecars. The restore
contract ("the member is named `memory.db`") is unchanged. The backup golden
changes shape: members become `["memory.db"]` and the member's CRC is that
of the snapshot, so the golden must be regenerated against the new oracle
and the smoke's both-engine comparison must keep passing.

## Impact

Medium-high consequence, low-to-medium frequency: the race exists on every
shutdown that overlaps maintenance. This is the database-architect finding
from TS1's plan review.

## Plan Or Decision

TS first (it owns the command), Python second, baseline advanced in the same
commit. Reuse `snapshotDatabaseTo` for the snapshot into the staging area,
zip the snapshot, keep staging + rename. Decide explicitly whether Python's
`backup()` — still called in-process by `runtime backup`, `web/operations.py`,
and its own `repair-journeys --apply` — changes too (it should: same restore
image from both engines) or is left as compatibility-only with a documented
difference.

**2026-09-27: added to the CV22 release gate**, first in its order, by the Navigator's decision after the Workbench inspection that followed the Ariad trust floor ([amendment](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)). It is not Ariad, so US3 does not validate it, and the release waits for it. The plan above is single-engine now. TS5 deleted the Python core and the parity harness, so its Python half and the baseline advance fall away.

**Planned and assigned 2026-09-27, one delivery with CR062 and CR060.**
Quality assurance drafted the plan, and the technical panel reviewed it the
same day ([record below](#panel-review-2026-09-27)). The panel's changes are
folded in. Navigator decisions, 2026-09-27:
[D1a](#decision-d1-when-the-live-database-cannot-be-snapshotted) and
[D2a](#decision-d2-archives-already-on-disk). Plan approved, with Driver
`@viniciusteles` and Delivery `mirror-ts-core` for all three.

### Objective

Every dated archive is a consistent, self-contained image of the database as
committed at one instant. It restores in the journal mode the original ran in,
and only its owner can read it. A backup that did not produce an archive says so
in every runtime.

### Design

1. **One snapshot, one member (CR061).** `createZipBackup` snapshots the live
   database with `snapshotDatabaseTo`, which uses a read-only connection with the
   30 s busy timeout, and archives the snapshot as the single member `memory.db`.
   There are no `-wal` or `-shm` members, because a vacuumed snapshot has none.
   The member's DOS time is the moment of capture, from the injected clock. The
   restore contract (the member is named `memory.db`) and the recovery route are
   unchanged, and an older archive with sidecars still verifies and restores as
   before.
2. **The image restores as the original ran (panel: database-architect).**
   Before the snapshot is archived, it is switched to WAL, checked with
   `PRAGMA quick_check`, and closed. A snapshot that fails the check is not
   published. The work that needs the driver lives in `#db/database.ts`, beside
   `snapshotDatabaseTo`, because that is the one module that holds the driver.
3. **Owner-only from the first byte (CR062; panel: security-engineer).** The
   snapshot's file is created empty, with mode 0600 and the exclusive flag,
   before `VACUUM INTO` writes into it. The zip's staging file is written with
   mode 0600, and the rename keeps that mode. A backups directory the backup
   creates is created 0700. Existing archives are covered by
   [D2](#decision-d2-archives-already-on-disk).
4. **Staging that cannot collide and does not travel (panel: engineer,
   devops-engineer).** The snapshot is taken in a private temporary directory
   (0700, named with the process id), never in the backups directory, which on
   the Navigator's install is a Dropbox folder. The zip is staged beside its
   final name, under a name that carries the process id and a random suffix, so
   two sessions ending in the same second cannot write into one file. The sweep
   removes a stranded staging file or snapshot directory only when its process is
   gone. That rule is `liveBackup.ts`'s rule for the pre-write snapshot (finding
   N4), extracted once and shared rather than copied. A legacy `.zip.partial`
   with no process id is removed as it is today.
5. **A backup that did not happen says so (CR060).** `--silent` suppresses
   progress lines, not failure. These paths produce no archive: no Mirror home
   resolved, the database missing, the snapshot or its check failing, or the
   write failing. On each of them `backup` exits 1 with one stderr line that
   leads with "no archive was written" and then says why, and it never prints a
   stack trace. The Pi extension already logs such a line as a WARN in
   `mirror-logger.log`, and the Claude Code and Gemini CLI hooks already record
   the exit in `hooks.log`. `hooks.log` keeps only the exit code, so the route
   also writes a content-free category into the front-door log's detail (panel:
   devops-engineer): `backup=home_unresolved`, `backup=database_missing`,
   `backup=snapshot_failed`, or `backup=write_failed`.
6. **A failed backup keeps what there was.** The retention sweep runs only
   after a successful write, as it does today, so older archives survive a failed
   backup. No raw copy stands in for a snapshot; see
   [D1](#decision-d1-when-the-live-database-cannot-be-snapshotted).
7. **The in-process callers keep their contracts.** `repair-encoding --apply`,
   the conversation logger, `runtime backup`, and the updater already refuse or
   report when `createZipBackup` returns nothing or throws. They gain the
   snapshot and the modes and change nothing else.

### Decision D1: when the live database cannot be snapshotted

A malformed database, or one locked past the busy timeout, cannot be vacuumed.

- **D1a. Fail loudly and keep the older archives (recommended).** The failure
  reaches the logs (design 5) and the last good archives stay. Every routed write
  already refuses on such a database, because the pre-write snapshot uses the
  same `VACUUM INTO`.
- **D1b. Fall back to a raw copy, marked unverified.** This keeps forensic bytes
  of a damaged database. The cost is a second archive format, and the updater's
  verifier would reject that archive anyway.

### Decision D2: archives already on disk

Existing installs have archives written 0644. On the Navigator's install there
are 58 of them, in a Dropbox folder at 0755. REFERENCE.md records that
pre-existing directories are never mutated.

- **D2a. Tighten Mirror's own archives, never the directory (recommended).**
  Each backup sets every `memory_*.zip` in its directory to 0600. The directory
  keeps its mode, as the posture requires, so a Dropbox folder stays as its
  owner set it.
- **D2b. New archives only.** The 0644 archives stay readable by others until
  retention deletes them, up to 30 days.
- **D2c. Also tighten a pre-existing backups directory.** This hides the listing
  too, but it amends the recorded posture rule, and on this install it would
  change a Dropbox folder.

### Affected files

- `ts/src/backup/zipBackup.ts`: the snapshot, the single member, the staging
  names, the sweep rule, the modes, and its header's list of reproduced
  behavior.
- `ts/src/db/database.ts`: the snapshot's WAL switch and check, beside
  `snapshotDatabaseTo`.
- `ts/src/frontDoor/liveBackup.ts` and one new shared module for the
  dead-process staging rule.
- `ts/src/frontDoor/dbSafetyToolsRoute.ts`: `runBackupRoute`'s exits, its
  one-line failures, and the front-door log category. It also touches the
  dispatch in `ts/src/frontDoor/cli.ts` that carries the category.
- Tests:
  - `ts/test/backup/zipBackup.test.ts` builds real SQLite databases at test
    time, including one with rows committed only in the WAL under a held writer.
  - Member grading becomes semantic: the member opens, passes `quick_check`,
    holds the rows, and reports the journal mode.
  - A route test covers exit codes and stderr, and POSIX-only tests cover the
    modes.
- Golden: `ts/test/goldens/backup.golden.json` keeps stdout, stderr, exit codes,
  and listings. The fixture bytes and member CRCs go, and `missing_db_silent`
  becomes exit 1 with its line. Each edit is made by a script that asserts its
  counts, with a row in `ts/test/goldens/README.md`.
- Docs: REFERENCE.md (what an archive contains, and the posture's dated
  archives), and this CR with CR062 and CR060.

### Plateaus

One reason per golden diff.

1. **Snapshot (CR061).** Red first: rows committed only in the WAL under a held
   writer are missing from the `memory.db` member. Then the snapshot, the WAL
   switch and check, the staging, and the shared sweep rule, with the fixtures
   moved to real databases. Evidence: the cost, measured on a snapshot of the
   real database.
2. **Owner-only (CR062).** Red first: the POSIX mode tests. Then the modes and
   D2.
3. **Loud failure (CR060).** Red first: `backup --silent` with no database
   exits 0. Then the exits, the lines, the log category, and the golden.
4. **Close.** The records, the validation route, the handoff review, the Debt
   Review, and Done.

### Acceptance criteria

1. With rows committed only in the WAL under a held writer, the archive has
   exactly one member, `memory.db`. On its own it opens, passes `quick_check`,
   holds every committed row, and reports `journal_mode` `wal`.
2. The updater's verifier reports that archive valid, and the file it checked
   holds the rows.
3. Two backups with the same timestamp both complete, and neither removes the
   other's staging file or snapshot. A stranded staging file or snapshot
   directory is removed when its process is gone and kept while its process is
   alive. No snapshot is ever written into the backups directory.
4. On POSIX, the archive is 0600, a backups directory the backup creates is
   0700, and the snapshot's file is never group- or other-readable. Existing
   archives and directories follow D2.
5. On success, `backup --silent` prints nothing and exits 0. It exits 1 with
   exactly one stderr line and no stack trace in each of these cases: no
   resolvable home, a missing database, a failed snapshot or check, or a failed
   write. In each case it leaves no staging file and keeps the older archives.
   Without `--silent`, today's stdout lines stay, and each failure exits 1.
6. The front-door log records `exit=1` with the failure category, and no path or
   argument value.
7. `repair-encoding --apply`, the conversation logger's backup,
   `runtime backup`, and the updater's backup stage pass their tests, unchanged
   in behavior.
8. `npm test`, `npm run typecheck`, `npm run lint`, the repository checks, the
   smokes, and CI are green.
9. The Navigator walks the route below and accepts it.

### Validation route

Part A runs in a scratch home, CLI only, with no Pi session (CR106). Its output
before the change is recorded under [Evidence](#the-route-before-the-change).
Run it from the repository root as a script, with `bash <file>`, so that no
interactive alias applies (an `ls` aliased to `eza`, for one, reads `-L` as a tree
depth). It deletes its temporary directory:

```bash
V=$(mktemp -d) && mkdir -p "$V/home" "$V/empty" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr061() { node ts/src/frontDoor/cli.ts "$@"; }
cr061 conversation-logger session-start --fast > /dev/null 2>&1
echo '--- step 1: a live writer holds 500 rows in the WAL while backup --silent runs'
node --input-type=module -e '
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
const db = new DatabaseSync(process.argv[1]);
db.exec("PRAGMA wal_autocheckpoint=0; CREATE TABLE cr061_probe (body TEXT); PRAGMA wal_checkpoint(TRUNCATE);");
const insert = db.prepare("INSERT INTO cr061_probe VALUES (?)");
for (let i = 0; i < 500; i++) insert.run(`row ${i}`);
const run = spawnSync(process.execPath, ["ts/src/frontDoor/cli.ts", "backup", "--silent"], { encoding: "utf8" });
console.log(`exit ${run.status}; stdout ${JSON.stringify(run.stdout)}; stderr ${JSON.stringify(run.stderr)}`);
db.close();' "$V/home/memory.db"
A=$(ls "$V/home/backups"/memory_*.zip | head -1)
echo '--- step 2: what the archive holds, and its memory.db member on its own'
unzip -Z1 "$A"
unzip -p "$A" memory.db > "$V/member.db"
sqlite3 "$V/member.db" "SELECT 'rows: ' || count(*) FROM cr061_probe; PRAGMA journal_mode; PRAGMA quick_check;"
echo '--- step 3: modes'
stat -f '%Sp %N' "$V/home/backups" "$A" | sed "s|$V|\$V|"
echo '--- step 4: a silent backup with no database'
cr061 backup --silent --mirror-home "$V/empty"; echo "exit $?"
echo '--- step 5: the updater verification path'
cr061 runtime backup --mirror-home "$V/home" | grep -E '^(Entries|Verification result):'
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

Pass for Part A:

- Step 1: exit 0, nothing printed.
- Step 2: one member, `memory.db`, then `rows: 500`, `wal`, `ok`.
- Step 3: the archive is `-rw-------`.
- Step 4: one line on stderr saying that no archive was written and that the
  database was not found, then `exit 1`.
- Step 5: `Verification result: valid` and `Entries: memory.db`.

Part B runs one ordinary backup on the real home and lists its directory before
and after it. Nothing else changes. `command` keeps an interactive alias from
shadowing `ls` or `stat`:

```bash
B="$HOME/.mirror-minds/vinicius-ts/backups"
command ls -lL "$B/" | awk 'NR>1 {print $1}' | sort | uniq -c; command stat -Lf '%Sp' "$B"
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts backup
command ls -lL "$B/" | awk 'NR>1 {print $1}' | sort | uniq -c; command stat -Lf '%Sp' "$B"
```

Pass for Part B, under D2a: a `Backup created:` line, and afterwards every file
in the folder is `-rw-------`. The folder itself keeps `drwxr-xr-x`, and no
snapshot or `.partial` is left in it.

Fail: more than one member, fewer than 500 rows, `delete` for the journal mode,
a group- or other-readable archive, `exit 0` or a stack trace in step 4, a
changed folder mode in Part B, or any staging file left behind.

### Conscious exclusions

- A restore command. Recovery stays manual, and its route is unchanged.
- Verifying an older archive together with its sidecars. The verifier still
  checks `memory.db` alone, and the updater only verifies archives it has just
  created, which are now snapshots.
- `restoreFromBackup` in `liveBackup.ts`, which would also restore a
  rollback-journal snapshot. It has no production caller.
- Restoring WAL on open for an existing database whose mode drifted.
- The pre-write snapshot's location. It lives in the backups directory too, so
  on this install every routed write re-writes a 58 MB file inside Dropbox. That
  comes from the install's layout, not from this plan.
- Windows ACLs, encryption, and off-machine copies.
- The same timestamp twice. The second archive replaces the first, and both are
  valid.

### Authority boundaries

Plan approval moves CR061, CR062, and CR060 to `planned`. A human Driver and a
Delivery reference are required before `in_progress`. `validated` requires the
Navigator to walk the route above and accept it. Each plateau is committed on
the Delivery branch and pushed when green, with GitHub Actions verified after
every push. Merge, publication, and release are not authorized.

Navigator decisions, 2026-09-27: Driver `@viniciusteles`, Delivery
`mirror-ts-core`.

### Panel review (2026-09-27)

This is the plan review before implementation, per the CV22 collaboration
strategy. The quality-assurance draft was reviewed by the engineer,
database-architect, devops-engineer, security-engineer, ai-engineer,
prompt-engineer, experience-designer, and product-designer lenses. Only dissent
was recorded.

Synthesis: the plan is sound, and narrower than three CRs suggest, because one
function changes and five callers inherit a consistent archive. Risk sits in two
places the CRs did not name. The first is the restore image, which must come
back in the journal mode the original ran in and be opened before it is
published. The second is the test oracle, which was built to grade a raw copy
and cannot grade a snapshot. The plan succeeds if an archive taken during
writes restores every committed row in WAL mode, if only its owner can read it,
and if a backup that did not happen shows in every runtime's log.

| Lens | Dissent | Resolution |
|---|---|---|
| database-architect | A `VACUUM INTO` snapshot comes out in rollback-journal mode, and Mirror sets WAL only when bootstrap creates a missing file. Every restore of the new archive would therefore run in a mode the original never ran in, with more lock contention between hooks, the extension, and the MCP server. The draft also published the snapshot without opening it, although this project's own verifier says that a backup that has never been opened is a belief | Design 2: switch the snapshot to WAL and `quick_check` it before publishing. Measured: 26 ms on 58 MB, leaving one self-contained file with a WAL header |
| security-engineer | `VACUUM INTO` creates its target with the process umask, so a full copy of the database would be group- and world-readable until a `chmod` ran. Wherever it is staged, that window is the defect CR062 exists to close | Design 3: the file is created empty with 0600 and the exclusive flag, and `VACUUM INTO` writes into it. Measured: SQLite accepts the empty target and the mode holds |
| devops-engineer | The draft staged the snapshot in the backups directory, which on the Navigator's install is a Dropbox folder, so every session end would upload a 58 MB file and delete it. `hooks.log` records only that `backup` exited 1, not why. And the draft added work to the shutdown path without a number | Design 4 stages the snapshot privately, and design 5 writes a content-free category into the front-door log. Cost on a snapshot of the real database: 325 ms snapshot and 26 ms check, beside a 1,504 ms deflate that exists today |
| engineer | The draft copied `liveBackup.ts`'s dead-process staging rule, and two copies of a safety rule drift. The golden graded member CRCs against a Python oracle that no longer exists, while a snapshot's bytes depend on the SQLite build | One shared staging rule (design 4). Members are graded semantically in tests, and the golden keeps output, exit codes, and listings |
| prompt-engineer | The draft's stderr line named a reason but not the consequence. A reader skimming a log needs to see first that no archive was written | Design 5's line leads with it |

The ai-engineer, experience-designer, and product-designer lenses raised no
objection. No model is involved, nothing a user sees changes except the failure
line, and the product question, whether a backup should exist, answers itself.

## Evidence

### Characterization (2026-09-27)

Every figure under [As characterized](#as-characterized-2026-09-27) was produced
in scratch homes with the TypeScript modules as they stand on `0c3126f0`:

- The WAL-only rows. A `node:sqlite` writer with `wal_autocheckpoint=0` holds
  500 committed rows in the WAL while `backup --silent` runs. The `memory.db`
  member is then read alone and `verifyBackupArchive` is run on the archive.
- The torn pair. The main file is read, the writer runs
  `PRAGMA wal_checkpoint(TRUNCATE)`, and then the WAL is read, reproducing
  `collectEntries`' order with a checkpoint between the reads.
- The snapshot mechanics. `snapshotDatabaseTo` writes into a file pre-created
  empty with 0600. The header bytes are read before and after
  `PRAGMA journal_mode=WAL`. The timings come from a snapshot of the real
  database, taken read-only exactly as every routed write takes one.
- The install. `readlink` and `stat` on `<home>/backups`, and a count of modes
  in the folder it points to.

### The route before the change

Part A of the [validation route](#validation-route), run on `0c3126f0`:

```text
--- step 1: a live writer holds 500 rows in the WAL while backup --silent runs
exit 0; stdout ""; stderr ""
--- step 2: what the archive holds, and its memory.db member on its own
memory.db
memory.db-wal
memory.db-shm
rows: 0
wal
ok
--- step 3: modes
drwx------ $V/home/backups
-rw-r--r-- $V/home/backups/memory_20260927_195502.zip
--- step 4: a silent backup with no database
exit 0
--- step 5: the updater verification path
Verification result: valid
Entries: memory.db
```

Steps 2, 3, and 4 fail as characterized. The directory in step 3 is already
0700, because the pre-write snapshot created it at the first routed write, so
in this route only the archive's mode tells old from new. Step 5 runs after the
writer has closed and checkpointed, so it passes today. It is there to show
that the updater's path still works.

### Plateau 1 handoff (2026-09-27)

Now true: `createZipBackup` archives one member, `memory.db`. It is a snapshot
of the database as committed, taken with `snapshotDatabaseTo` into a file
created empty at 0600 inside a private directory under the OS temp dir.
`prepareArchiveSnapshot` (`ts/src/db/database.ts`) then switches the snapshot
to WAL and checks it, and a snapshot that fails the check is not published.
The zip is staged beside its final name as
`memory_<stamp>.zip.<pid>-<12 hex>.partial`. Stranded staging, in the backups
directory or the temp dir, is swept only when its writer is gone and it is ten
minutes old. That rule lives in `ts/src/backup/staging.ts` and `liveBackup.ts`
now uses it too, instead of its own copy. A pre-CR061 `.zip.partial` is removed
as it always was. The member's DOS time is the moment of capture. A database
that cannot be snapshotted throws `BackupSnapshotError`, publishes nothing, and
keeps the older archives.

Evidence, red first. The new test with rows held in the WAL by an open writer
failed on three members. It passes now with one member, all 150 rows, `wal`,
and `ok`. The fixtures are real databases, and the golden's two member-grading
scenarios, the fixture bytes, and the member CRCs were edited by a script that
asserted every count, after proving that its serializer reproduces the file
byte for byte. The edit has a row in the goldens README. Three mutants each fail
a test that names what they broke:

- no WAL switch fails the WAL-rows test and `full`;
- a sweep that ignores the writer fails the sweep test;
- a snapshot staged in the backups directory fails the "taken privately" test.
  That test first passed the mutant, because the snapshot was removed before
  the listing was taken. It now asserts that the temp dir was used.

`createZipBackup` end to end on a snapshot of the real 57.6 MB database took
1,801, 1,812, and 1,811 ms, for an 18.4 MB archive. The deflate that existed
before accounts for about 1.5 s of that.

The full suite passes (2,766 tests), with typecheck and lint (the same warning
and info note as HEAD), the four repository checks, the custody proofs, the
five end-to-end smokes, the four runtime smokes, and the runtime updater smoke,
which creates and verifies an archive through the updater's own path. Part A
of the route now passes step 2 (one member, `rows: 500`, `wal`, `ok`). Step 3
still shows a 0644 archive and step 4 still exits 0.

Remaining: the modes and the loud failure. Next: plateau 2, owner-only.

### Plateau 2 handoff (2026-09-27)

Now true: every archive is owner-only from its first byte. `publishArchive`
writes the staging file 0600 and renames it into place, and the rename keeps
the mode. A backups directory the backup creates is 0700. Under D2a, each
backup tightens every `memory_*.zip` in its directory to 0600, including those
written before this CR, and leaves the directory and any file that isn't
Mirror's as they are. The snapshot was already owner-only from plateau 1, and
the member carries its 0600, which is the mode `unzip` restores `memory.db`
with.

Evidence, red first. Under umask 022, a created directory came out 0755 and the
new and older archives 0644. Four tests pin the modes now. Five mutants were
run:

- a snapshot file created with the default mode fails the snapshot test;
- no tightening fails the D2a test;
- a tightened directory fails the D2a test;
- a directory created with the default mode fails the created-directory test;
- a staging file written with the default mode failed nothing at first, because
  the tightening that follows the rename chmods the new archive too. That masked
  a real window: in a pre-existing 0755 folder the archive was readable from its
  first byte until the tightening, or for good if the process died in between.
  Publishing became its own function, `publishArchive`, with its own test, and
  that mutant now fails it.

The full suite passes (2,770 tests), with typecheck and lint (the same warning
and info note), the four repository checks, the conversation lifecycle smoke,
the runtime updater smoke, and the Claude plugin smoke. REFERENCE.md's security
posture lists the dated archive among the creation points. Part A of the route
now passes step 3 (`-rw-------`), and step 4 still exits 0.

Remaining: the loud failure. Next: plateau 3.

### Plateau 3 handoff (2026-09-27)

Now true: a backup that wrote no archive says so, silent or not. `runBackupRoute`
returns an outcome whose content-free category reaches the front-door log:
`backup=home_unresolved`, `backup=database_missing`, `backup=snapshot_failed`,
or `backup=write_failed`. Each of those paths exits 1 with one stderr line,
`backup: no archive was written: <why>`. The one exception is a missing
database without `--silent`, which keeps the stdout line it always printed and
now also exits 1. An expected failure (a snapshot the database refused, an
operating-system refusal, an archive too large for the writer) becomes that one
line, and anything else is a bug and keeps its stack trace. The CLI gives
`backup` a resolver that throws, so an unresolved home is reported once, in the
backup's own words. The Pi extension, the hooks, and `hooks.log` needed no
change.

Evidence, red first. All ten new route tests failed on the old route. They
cover the two golden missing-database scenarios, three failure categories each
silent and not, success, and one run through the real front door that checks a
single line, no stack trace, and a log line without the path. The golden's
`missing_db_silent` changed by script (exit 0 to 1, and its line), with a row in
the goldens README. The full suite then found `dbSafetyToolsCli.test.ts`
pinning the old behavior ("a missing database exits 1 (0 when silent)"). My
search for callers had missed it because it drives the CLI as a subprocess. It
now asserts the new behavior. Four mutants each fail a test:

- the old silent exit 0;
- the line printed without `--silent` too;
- the category dropped;
- a bug swallowed into a failure line, which the last test added.

The full suite passes (2,781 tests), with typecheck and lint (the same warning
and info note), the four repository checks, the custody proofs, the five
end-to-end smokes, the four runtime smokes, and the runtime updater smoke.
Part A of the route passes every step. The route recorded above is byte for
byte the script that was run.

Remaining: the Navigator's validation (Parts A and B), the handoff review, the
Debt Review, and Done.

### Navigator validation (2026-09-27)

The Navigator walked the [validation route](#validation-route) and accepted it.

- **Part A**, run as `bash tmp/cr061-route.sh`, passed every step:
  1. exit 0, nothing printed;
  2. one member, `memory.db`, then `rows: 500`, `wal`, `ok`;
  3. the archive `-rw-------`;
  4. one line, `backup: no archive was written: database not found: …`, then
     `exit 1`;
  5. `Verification result: valid`, `Entries: memory.db`.
- **Part B** ran one backup on the real home:
  `Backup created: memory_20260927_215247.zip (17925 KB)`, and the Dropbox
  folder stayed `drwxr-xr-x`. The route's own listing did not show the files,
  because the Navigator's interactive `ls` is aliased to `eza`, which reads `-L`
  as a tree depth, and it listed the repository instead. The route now uses
  `command ls` and `command stat`, and Part A says to run it as a script. The
  Navigator then listed the folder himself: all 61 files are `-rw-------` (the
  58 older archives, the new one, and the two front-door snapshots), and no
  staging was left behind.
- The new archive is 18 MB, where the raw copies taken earlier that day were 20
  MB, as expected of a vacuumed database with no WAL member.

CI was green on each plateau's last push: plateau 1 (`64b4a164`), plateau 2
(`2747a9ae`), and plateau 3 (`37df8c4b`), Tests and Docs.

### Handoff review (2026-09-27)

This review came after validation, per the collaboration strategy. The baseline
panel (engineer, quality-assurance, database-architect, devops-engineer,
security-engineer) and the lenses that reviewed the plan (ai-engineer,
prompt-engineer, experience-designer, product-designer) reviewed the delivered
code, tests, safety posture, operational cost, and resumability. Two claims
were checked before they were written down. `entryFromFile`, no longer used by
the backup, still builds fixture archives in the runtime-backup tests, so it is
not dead code. And the sweep of a shared temp directory unlinks a symlink
planted under a matching name without touching its target, which was checked
with a dead writer's pid and an old mtime.

Synthesis: the delivery closes all three defects at their root, and the
Navigator's walk showed them closed on the real install. The source changed by
309 lines added and 118 removed, and the tests grew by 508. Most of that is the
shared staging rule and the tests that grade what a restore gets. Its weak
points are the text around it: a skill that still describes the old archive, a
pattern written twice, and a new requirement that nobody documented.

| # | Lens | Finding | Class | Recommendation |
|---|---|---|---|---|
| 1 | prompt-engineer | The Claude Code `/mm:backup`, in the checkout and in the plugin, still says the backup "Zips the database including WAL/SHM sidecars for consistency": the defect, described as a virtue. Neither copy says what to do when a backup fails. The Pi copy tells the agent to answer "Memory database backed up." unconditionally, so a failed backup can be announced as a success | Non-blocking debt. The false line comes from this CR's change; the unconditional success predates it | Pay now: both copies describe the snapshot and tell the agent to report the failure line as a failure, and the plugin is regenerated |
| 2 | engineer | `tightenArchives` added a second copy of the pattern that says what a Mirror archive is called, beside the retention sweep's | Non-blocking debt, introduced here | Pay now: one named constant used by both |
| 3 | devops-engineer | The snapshot is staged under the OS temp dir, so a backup now needs free temp space about the size of the database. Where `/tmp` is a small tmpfs, every backup would fail. The failure would be loud, with the reason in the line, but nothing documents the requirement, or that `TMPDIR` moves it | Non-blocking debt, introduced here | Pay now: one sentence in REFERENCE.md |
| 4 | quality-assurance | No Windows run exercised the new path. The TypeScript CI matrix is Linux and macOS, and the mode tests skip on Windows. `VACUUM INTO`, `mkdtemp`, and the dead-process check are portable in principle, but that has not been observed | Accepted scope boundary | No action here. Windows promotion belongs to US3 |

The other lenses were silent:

- database-architect: `VACUUM INTO` carries the schema, `_migrations`, and the
  header's user version. The restored image reopens in WAL mode. The runtime
  updater smoke created and verified an archive through the updater's own path
  on every plateau.
- security-engineer: the snapshot never exists outside a 0700 directory, and
  its file is 0600 from creation. A killed backup leaves at most a private
  directory, which the next backup removes once its writer is gone.
- ai-engineer, experience-designer, product-designer: no model in the loop,
  output unchanged on success, and nothing to add.

Accepted scope boundaries, as planned: a restore command, re-verifying older
archives with their sidecars, `restoreFromBackup`, restoring WAL on open, the
pre-write snapshot's location, Windows ACLs, encryption, and off-machine copies.

## Outcome

_Pending._

## Provenance

Database-architect finding in CV22.DS7.TS1's plan review; captured at that
story's Debt Review on 2026-09-08.
