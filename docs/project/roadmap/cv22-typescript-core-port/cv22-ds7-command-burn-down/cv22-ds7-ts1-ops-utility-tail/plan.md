[< Story](index.md)

# Plan — CV22.DS7.TS1 — Ops/utility tail 1: DB safety tools

## Objective

Port `python -m memory backup` and `python -m memory repair-encoding` to the
TypeScript core with proven parity, route both to TS ungated, and flip the
`conversation-logger repair-journeys --apply` route US10 left on Python —
so the dated-archive backup gate exists in TS before the Soul (US6) and
Builder (US8) write ports need it, and the burn-down ledger moves 0/6 → 2/6.

## Terrain (read before planning; facts, not assumptions)

- **`backup.py` (204 lines).** Resolves the DB from `--mirror-home` (or the
  configured home) and the destination from `--backup-dir` →
  `<mirror_home>/backups` → `DB_BACKUP_PATH`. Writes
  `memory_YYYYMMDD_HHMMSS.zip` (local time) via a `.partial` staging file and
  `os.replace`; the archive members are always `memory.db` plus
  `memory.db-wal` / `memory.db-shm` when the sidecars exist (raw file copy,
  `ZIP_DEFLATED`). Then sweeps stranded `*.zip.partial` and deletes
  `memory_*.zip` older than 30 days by the timestamp in the name (unparseable
  names are skipped). Prints `Mirror home:` (only when a mirror home was
  passed), `Database:`, `Backup dir:`, `Backup created: <name> (<KB> KB)`,
  `Removed N backup(s) older than 30 days.`; warns on the deprecated
  `BACKUP_DIR` env. **With `--silent`, failure exits 0** — the session-shutdown
  backup can fail invisibly. Does not chmod the archive.
- **`repair_encoding.py` (198 lines).** Two regex passes over user-text
  columns of seven tables (missing tables/columns ignored): Latin-1 pairs
  `[Â-Ã][\x80-\xBF]` then Windows-1252 pairs `[Â-Ã].` (DOTALL), each
  re-encoded and strictly UTF-8-decoded, unchanged on failure. Dry-run by
  default: prints `Database:`, `Repairable mojibake hits: N`, up to `--limit`
  preview lines (`table.column row=id: before -> after`, whitespace-collapsed,
  code-point-capped at 80), `… N more`, then `Dry-run only…` (exit 0).
  `--apply`: `No changes needed.` when no hits; otherwise a non-silent
  `backup()` unless `--no-backup` (`Backup failed; aborting repair.` → exit 1),
  then one commit of per-`_rowid_` UPDATEs and `Applied repairs: N`.
- **`repair-journeys --apply` (US10).** TS `journeyRepair.ts` already takes an
  injected `backup: () => string | null` and refuses on `null`; `cli.ts` routes
  `--apply` to Python only because no TS zip backup exists.
- **Runtime reality (found while planning).** `.pi/extensions/mirror-logger.ts`
  and `.gemini/hooks/*.sh` call `uv run python -m memory …` directly; they do
  not enter `ts/src/frontDoor/cli.ts`. The mirror home's `front-door.log` has
  zero `conversation-logger` lines. Every "flipped" hook route is exercised by
  the smoke harness and by skills, not by live Pi sessions. For this story:
  routing `backup` to TS changes nothing at session shutdown unless the
  extension's `backup --silent` call moves to the front door. In scope here
  for that one call; the general gap is captured as a CR (see Debt).
- **Existing TS pieces to reuse, not duplicate.** `resolveDbPath` (mirror
  home, `--db-path`, `MEMORY_ENV` naming); `withLiveWriteDb` (pre-write
  snapshot + schema state + always-close); `liveBackup.ts` (fixed-name
  `VACUUM INTO` snapshot — a *different* property, kept as is); Node ≥ 24
  `zlib.crc32` and `deflateRawSync`. `ts/` has no zip dependency and gets none.

## Scope

1. **`ts/src/backup/zipWriter.ts`** — minimal deterministic ZIP writer
   (local headers, deflate-raw, central directory, EOCD; DOS mtimes from file
   stat in local time, like `zipfile`). No ZIP64: refuse with a clear error
   above 4 GiB (Python would auto-ZIP64; bounded non-parity, memory.db is MBs).
2. **`ts/src/backup/zipBackup.ts`** — `createZipBackup({dbPath, backupDir,
   mirrorHome, silent, now})` reproducing `backup()`: naming, staging +
   rename, member set and order, retention sweep, stdout lines, silent
   semantics, deprecated-env warning. Injectable clock for goldens.
3. **`ts/src/repair/encodingRepair.ts`** — `repairText`, `hasRepairableMojibake`,
   `scanDatabase`, `applyRepairs`, `preview`, with a small Windows-1252
   encoder table (0x80–0x9F, five undefined code points fail like Python) and
   a Python-`str.split()` whitespace predicate.
4. **Front door.** `runBackup` (no DB open, no bootstrap — a missing DB is
   `Database not found`, exit 1, exactly like Python); `runRepairEncoding`
   (dry run over a read connection; `--apply` through `withLiveWriteDb`, which
   also takes the front door's own pre-write snapshot — silent, additional,
   not a stdout difference). `runConversationLoggerWrite` passes
   `backup: () => createZipBackup(...)` for `repair-journeys --apply`.
5. **Routing.** `backup` and `repair-encoding` to TS; `repair-journeys --apply`
   to TS. Revert controls: `MIRROR_TS_BACKUP=0` (sends `backup` **and**
   `repair-journeys --apply` back to Python, since the latter's gate is the TS
   backup) and `MIRROR_TS_REPAIR_ENCODING=0`.
6. **Runtime callers.** `.pi/extensions/mirror-logger.ts` session-shutdown
   `backup --silent` moves to the front door through a `runFrontDoor` helper
   (same invocation shape as the skills); `.pi/skills/mm-backup/SKILL.md`
   switches to the front door like the other ported skills.
7. **Parity evidence.** Two committed goldens with generators in the CI
   determinism gate; oracle registration of both Python files; a
   `repair_encoding` write probe on the demo copy; a `backup` archive-parity
   check on the demo copy (member names, CRC32, sizes; both archives pass
   Python `zipfile.testzip()`); the lifecycle smoke extended to `backup`,
   `repair-encoding`, and `repair-journeys --apply` on a disposable home; the
   burn-down ledger updated with the seven-point checklist.

## Non-Goals

- No behavior change. Raw-file copy of a live WAL database, `--silent`
  exiting 0 on failure, no archive chmod, retention by filename — all
  reproduced, not fixed. Fixes become CRs (see Debt) and land in TS after the
  flip, when TS owns the command.
- No byte-identical archives. Deflate output differs across zlib builds;
  parity is graded on member names, order, CRC32, and uncompressed size, and
  the `(<KB> KB)` token in stdout is normalized in the golden.
- No ZIP64.
- No wholesale switch of the Pi extension or Gemini hooks to the front door
  (CR under RS009); only the `backup --silent` call moves here.
- No `welcome`/`runtime` reads (TS3), no extension catalog or
  `journey-projection` (TS4), no `runtime` mutating half or `migrate-legacy`
  (DS10), no sibling DS7 stories (US6–US9), no DS8/DS9/DS10 work.
- No Python feature work. Python still owns both commands until the flip; a
  defect found in the oracle is fixed in Python first (moving-target rule),
  registered through the drift tripwire, then mirrored.

## Acceptance Behavior

```text
Given a mirror home whose memory.db has -wal and -shm sidecars
When `backup` runs through the front door with a frozen clock
Then <home>/backups/memory_<ts>.zip exists, no .partial remains,
  its members are memory.db, memory.db-wal, memory.db-shm in that order,
  each member's CRC32 and size equal the Python archive's for the same files,
  and stdout matches Python line for line (size token normalized)

Given that backups directory also holds memory_<31 days ago>.zip,
  memory_<yesterday>.zip, memory_notadate.zip, and memory_<ts>.zip.partial
When `backup` runs
Then the 31-day-old archive and the .partial are removed, the other two stay,
  and stdout reports "Removed 1 backup(s) older than 30 days."

Given no database at the resolved path
When `backup` runs
Then stdout says "Database not found: <path>", exit 1 — and exit 0 with --silent

Given rows carrying "Ã©", "Ã“", "Âº", legitimate "Âncora", an astral
  code point after "Ã", and a control-character run in a preview
When `repair-encoding` runs dry-run through the front door
Then the hit count, order, and every preview line match Python exactly
  and no row changes

Given the same rows
When `repair-encoding --apply` runs through the front door
Then a dated zip backup is created first (its lines printed), every hit row
  is updated in one transaction, "Applied repairs: N" is printed, and the
  final row state equals Python's on the same copy;
  with --no-backup no zip is created; if the backup fails the repair aborts
  with exit 1 and no row changes

Given a conversation with repairable journey findings
When `conversation-logger repair-journeys --apply` runs through the front door
Then the route is TS, a dated zip backup precedes the repair, and findings and
  post-repair columns match the existing journey_repair_apply probe

Given MIRROR_TS_BACKUP=0
When `backup` or `repair-journeys --apply` runs
Then both route to Python with identical observable output
```

## Parity Contract And Known Divergence Classes (pinned by golden)

- Regex `.` is one **code point** (`u` + `s` flags), never a UTF-16 unit.
- Preview collapses whitespace with Python's `str.split()` set (includes
  U+001C–U+001F, U+0085, U+00A0; excludes U+FEFF), not JS `\s`.
- Preview length and cut are by code point (`Array.from`), not `.length`.
- `(<KB> KB)` is `size/1024` formatted `.0f` — Python rounds half to even;
  TS must not use `toFixed`. Normalized in the golden anyway; pinned in a
  unit test on exact-tie sizes.
- Windows-1252 undefined bytes (0x81, 0x8D, 0x8F, 0x90, 0x9D) make the encode
  fail → chunk unchanged, like Python's `UnicodeEncodeError` path.
- Strict UTF-8 decode (`TextDecoder("utf-8", {fatal: true})`) rejects what
  Python's `bytes.decode("utf-8")` rejects.
- Scan SQL is identical (`SELECT _rowid_ …` with no ORDER BY): same engine,
  same plan, same order; the golden pins the order on the fixture.
- `Mirror home:` line printed only when `--mirror-home` was passed
  (argv-sensitive; golden covers both forms).

## Validation Route

Automated (CI):

- `ts/test/backup/*.test.ts` and `ts/test/repair/*.test.ts` against
  `ts/test/goldens/backup.golden.json` and `repair-encoding.golden.json`,
  generated by `ts/parity/generate_backup_golden.py` and
  `generate_repair_encoding_golden.py` (frozen clock, fixture DB with sidecars,
  retention scenario, all divergence classes above). Both generators join the
  determinism gate in `tests.yml`.
- Routing tests for the two commands, the `--apply` flip, and both revert
  controls; redaction test that `front-door.log` carries command and engine
  only (no paths, no preview text).
- Oracle-drift tripwire covers `cli/backup.py` and `cli/repair_encoding.py`.
- Parity job: `repair_encoding` write probe (seed mojibake rows on the demo
  copy → dry-run → apply → before/after rows and hit list vs Python);
  `backup` archive parity on the demo copy (member names/CRC32/sizes,
  `zipfile.testzip()` on both); lifecycle smoke extended to the three routes.

Navigator-visible route:

1. `uv run python -m memory repair-encoding` on your real home, dry-run,
   through the front door (`NODE_OPTIONS=--no-warnings node --env-file=.env
   ts/src/frontDoor/cli.ts repair-encoding`) and directly in Python —
   **expected:** identical output, `Dry-run only…`, no row changed (read-only).
2. `… cli.ts backup` on your real home — **expected:** `Backup created:
   memory_<now>.zip`, the file opens with `unzip -t`, no `.partial` left,
   `front-door.log` shows `backup ts exit=0` with no path.
3. Quit a Pi session — **expected:** a new `memory_<ts>.zip` under
   `~/.mirror-minds/vinicius-ts/backups` and a `backup ts` line in
   `front-door.log` (this is the extension-call move, visible for the first
   time).
4. On a **copy** of your home (never the live one): seed one mojibake row,
   run `repair-encoding --apply` — **expected:** a zip backup first, then
   `Applied repairs: 1`; then `MIRROR_TS_REPAIR_ENCODING=0` on the same copy
   — **expected:** Python answers with the same lines.

Pass: every expected observation holds. Fail: any output difference between
engines, a `.partial` left behind, a missing zip after Pi shutdown, or any
row changed by a dry run.

E2E decision: **required** — items 1–3 are E2E on the real home (1 is
read-only; 2 and 3 only create archives); item 4 is copy-only by rule.

## Implementation Contract

Plateaus, one commit each, in this order; nothing routes until plateau 5:

1. `encodingRepair.ts` by TDD against the repair-encoding golden (pure text
   functions first, then scan/apply on a fixture DB). Oracle registration.
2. `zipWriter.ts` + `zipBackup.ts` by TDD against the backup golden
   (writer unit tests: member layout, CRC, DOS time, 4 GiB guard; backup
   tests: staging, rename, retention, silent semantics, env warning).
3. Front door wiring for both commands and the `repair-journeys --apply`
   injection; routing entries **present but pinned to Python** behind the two
   env gates defaulting off — so the code ships before the flip, like US10.
4. Parity evidence: probes, archive-parity check, smoke extension, CI gate
   entries; ledger pre-flip entry with the checklist status.
5. Flip: gates default on, extension `backup --silent` → front door,
   `mm-backup` skill doc, ledger flip entry, `routing.ts` comment for the
   `--apply` route retired.

Rules: `uv run` for Python; no `git add .`; story-scoped commits with English
messages explaining why; no new npm dependency; TS strict, no `any`; one
directory per family (`ts/src/backup/`, `ts/src/repair/`); shared helpers
(`resolveDbPath`, `withLiveWriteDb`, `stripOptionWithValue`) reused, not
copied; Python touched only for oracle registration or a Python-first oracle
fix. The Windows-1252 table and the Python-whitespace predicate live next to
their only caller until a second caller appears.

## Persona Review (plan stage)

The full five-persona panel was **not convened**: under the 2026-09-07
strategy this is a small bounded slice with the DS4 write pattern to copy.
Recorded here per the rule that skipping is a decision, not a default. Two
lenses were applied; the Navigator may ask for the full panel before
approval.

**◇ quality-assurance**
- Blocker for the *claim*, not the story: flipped hook routes are not
  reaching production because the Pi extension bypasses the front door. This
  story moves the one call it owns and captures the rest as a CR; the ledger
  must stop implying otherwise.
- Grade archives by member CRC/size, never bytes; normalize the KB token.
- Pin every Unicode divergence class listed above — US10 found two of these
  the hard way.
- `backup --silent` exit-0-on-failure is preserved for parity and recorded as
  a CR; a validation route must show the failure is at least logged.
- The Navigator route must include a real Pi shutdown (item 3): it is the
  only way to observe that the extension now enters the front door.

**◇ database-architect**
- Python zips the raw `memory.db` + sidecars of a possibly-open WAL database
  with no read lock; the shutdown backup runs while a detached
  `session-maintenance` may still be writing. Parity keeps that; the CR
  should move the TS backup to `VACUUM INTO` (or the online backup API) after
  the flip, when TS owns it.
- `repair-encoding` updates by `_rowid_` — confirm at implementation that
  none of the seven targets is `WITHOUT ROWID`; FTS triggers fire identically
  at the SQLite level, so no extra FTS grading is needed.
- Repairing `memories.journey` / `conversations.journey` slugs without the
  identity side is a latent Python-era inconsistency, not this story's; note
  it in the CR list, do not widen scope.
- `--apply` goes through `openDatabaseForWrite` with the TS pragmas and the
  schema-state guard; on a database with unknown migrations TS refuses (exit
  2) where Python would proceed. Accepted: same posture as every ported write.

## Debt / CRs To Capture At Debt Review (not now)

- RS009: Pi extension and Gemini hooks bypass the front door; flipped routes
  do not reach production hot paths. Wholesale `runFrontDoor` switch.
- `backup --silent` exits 0 on failure (session shutdown never surfaces a
  failed backup).
- Backup should snapshot consistently (`VACUUM INTO` / backup API) instead
  of raw-copying a live WAL database.
- Archive permissions: zip written with default umask; the front door's own
  snapshot is 0600. Tighten in TS after the flip.
- Cross-table slug repair inconsistency in `repair-encoding` (journey slugs).

## Stop Conditions

- scope_change_detected — any temptation to fix the parity-preserved defects
  above inside this story.
- plan_rule_conflict — a shared helper would need to change shape to serve
  these commands.
- failing_required_check_without_clear_fix — golden regenerates differently
  on 3.10 vs 3.12 or Linux vs macOS (see the US10 hermeticity finding).
- navigator_decision_needed — a Python-first oracle fix becomes necessary; a
  `WITHOUT ROWID` target table appears; ZIP64 turns out to be reachable.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
