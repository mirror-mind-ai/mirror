[< Story](index.md)

# Test Guide — CV22.DS7.TS1 — Ops/utility tail 1: DB safety tools

## Automated Validation

Run from the repository root.

```bash
# Goldens regenerate as a no-op (determinism gate), then the TS suite
uv run python ts/parity/generate_backup_golden.py
uv run python ts/parity/generate_repair_encoding_golden.py
git diff --exit-code ts/test/goldens/
cd ts && npm run typecheck && npm run lint && npm test && cd ..

# Oracle-drift tripwire now covers cli/backup.py and cli/repair_encoding.py
uv run python scripts/check_oracle_drift.py

# Parity on a real-shaped copy (never the live database)
mkdir -p tmp/parity
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
uv run python ts/parity/write_parity.py --source-db tmp/parity/demo-memory.db --probe repair_encoding
uv run python ts/parity/write_parity.py --source-db tmp/parity/demo-memory.db --probe journey_repair_apply
# backup archive parity lives in the smoke: both real CLIs on the same file, Python's zipfile reading the TS archive
node ts/parity/conversation_lifecycle_smoke.ts   # now includes backup, repair-encoding, repair-journeys --apply
```

Expected: every command exits 0; the goldens diff is empty; the probes report
`PASS` with redacted evidence (counts, hashes, member names — no content, no
paths); the smoke reports the three new routes on `ts`.

Revert controls, exercised by the routing tests and by hand:

```bash
MIRROR_TS_BACKUP=0 NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts backup --mirror-home tmp/home
MIRROR_TS_REPAIR_ENCODING=0 NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts repair-encoding --mirror-home tmp/home
```

Expected: `front-door.log` shows `python` as the engine, output identical.

## E2E Decision

**Required.** Items 1–3 of the Navigator route run on the real home (1 is
read-only; 2 and 3 only create archives). Item 4 is copy-only by rule: write
parity is never proven against the live production database.

## Navigator Validation

1. **Dry run on the real home, both engines.**
   `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts repair-encoding`
   and `uv run python -m memory repair-encoding`.
   Expected: identical output ending in `Dry-run only. Re-run with --apply to
   modify the database.`; no row changed. Pass: outputs identical. Fail: any
   line differs, or the command exits non-zero.
2. **Backup on the real home through the front door.**
   `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts backup`
   Expected: `Backup created: memory_<now>.zip (<KB> KB)`; `unzip -t
   ~/.mirror-minds/vinicius-ts/backups/memory_<now>.zip` reports no errors and
   lists `memory.db` (plus `-wal`/`-shm` if present); no `.partial` remains;
   `tail -1 ~/.mirror-minds/vinicius-ts/front-door.log` shows `backup ts
   exit=0` with no path or payload. Fail: missing or unreadable archive, a
   `.partial` left behind, or a path in the log line.
3. **Real Pi session shutdown.** Quit Pi.
   Expected: a new `memory_<ts>.zip` in `~/.mirror-minds/vinicius-ts/backups`
   and a `backup ts exit=0` line in `front-door.log` — the first time the
   extension's shutdown backup enters the front door. Fail: no new archive,
   or the archive appears without a front-door log line (meaning the
   extension still called Python directly).
4. **Apply on a copy.** Copy the home to `tmp/home-copy`, seed one row with
   `Ã©` (the test guide's helper script does this), then
   `… cli.ts repair-encoding --mirror-home tmp/home-copy --apply`.
   Expected: backup lines, then `Applied repairs: 1`; re-running the dry run
   reports `Repairable mojibake hits: 0`. Then with
   `MIRROR_TS_REPAIR_ENCODING=0` on a fresh copy: Python prints the same
   lines. Fail: any difference between engines, or a change to the live home.

## Validation Evidence

Recorded 2026-09-08 in [validation.md](validation.md). Automated: 1240 TS
tests, both goldens deterministic on 3.10 and 3.12, oracle tripwire clean,
`repair_encoding` and `journey_repair_apply` probes green on the demo copy,
the 87-check lifecycle smoke with Python's `zipfile` reading the TS archive,
`.pi` typecheck clean. Navigator route: items 1, 2, 4 run by the Driver on the
real home (dry run byte-identical across engines; a real front-door backup,
`unzip -t` clean, redacted log line; apply on two seeded copies identical
across engines, live DB untouched); item 3 by the Navigator — a new Pi session
quit at 09:50 local produced `memory_20260908_095020.zip` and a
`backup / ts / exit=0` front-door log line, the first hot-path extension call
to enter the front door. Accepted by the Navigator.
