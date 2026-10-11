# Test Guide — CV22.DS6.TS4

Risk-first. Most coverage is hermetic TS; the heavy Python-oracle and
real-process concurrency proofs already live in TS3 and are referenced, not
duplicated.

## Automated — `ts/test/frontDoor/firstRun.test.ts` (rewritten)

The current test proves *Python* self-heal and is skipped without `uv`. Replace
it with hermetic TS self-heal coverage. No `uv` skip guard — TS bootstrap needs
no Python.

1. **Read self-heal.** Fresh temp dir, no `memory.db`. Run
   `journeys --db-path <missing>` through the built CLI (`spawnSync` on
   `cli.ts`, or call `main` in-process). Assert: exit 0; `memory.db` now exists;
   `journal_mode=wal`; `_migrations` contains every `KNOWN_MIGRATION_ID`;
   `foreign_keys=ON`. Assert no Python was needed (test passes with `uv` absent
   from PATH — assert on a sanitized env if practical).

2. **Write self-heal + backup gate.** Fresh dir, no DB. Run a write
   (`journey set-path <slug> <path>` or `identity set ...`). Assert: exit 0; DB
   created; the write is visible on reopen; `ensureBackup` ran without error on
   the freshly bootstrapped DB.

3. **Idempotency.** After case 1, run the command again. Assert: exit 0; no
   re-bootstrap (the lock file is not left behind; migration ledger unchanged);
   output stable.

4. **Consult negative (scope boundary).** Fresh dir, no DB. Run a `consult`
   invocation shaped to hit the logging path. Assert: **no `memory.db` is
   created**; command behavior matches its fail-soft contract.

5. **Existing-DB regression.** Pre-bootstrap a DB (via `bootstrapDatabase` in
   the test), then run read and write commands. Assert behavior is identical to
   today — the `existsSync` fast path skips bootstrap.

## Automated — helper unit test (`ts/test/db/bootstrap.test.ts` or new)

- `bootstrapDatabaseIfMissing(dbPath)` on a missing path creates a
  current-schema DB and leaves no open handle / no lock file.
- On an existing path it is a no-op: no new backup, no migration re-run, returns
  fast (does not acquire the bootstrap lock — assert via absence of the lock
  file mid-call or by injecting a spy where feasible).

## Referenced, not duplicated

- `ts/test/db/bootstrapConcurrency.test.ts` — 8 real child processes racing the
  same fresh path (TS3). TS4 relies on this for concurrency safety.
- `ts/parity/bootstrap_custody_parity.ts` — Python-oracle structural + ledger
  equivalence (TS3). Standing CI proof that TS bootstrap == Python bootstrap.

## Navigator smoke (E2E)

```bash
# fresh home, no memory.db
export MIRROR_HOME="$(mktemp -d)/mirror"
node ts/src/frontDoor/cli.ts journeys            # expect: journey list renders
node ts/src/frontDoor/cli.ts journey set-path demo /tmp/demo   # expect: write ok
ls "$MIRROR_HOME"                                 # expect: memory.db (+ -wal) present
```

- Expected: both commands succeed; `memory.db` exists with a WAL sidecar and a
  fully populated `_migrations` ledger.
- Pass: exit 0 with real content; DB is TS-created and current-schema; bootstrap
  not routed to Python.
- Fail: nonzero exit, DB absent, or bootstrap delegated to Python.

## Gate

- `ts/` typecheck + lint + `node --test` green.
- `.pi` TypeScript check green.
- Navigator smoke observed and accepted.
