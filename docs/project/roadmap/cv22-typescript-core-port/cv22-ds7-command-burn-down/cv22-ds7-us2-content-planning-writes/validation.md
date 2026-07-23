# Validation — CV22.DS7.US2

## Status

Passed

## Automated Checks

- npm test (ts/) -- 667 passing, incl. journeyPathParse/taskStore/weekView/taskImportSync goldens against the real Python oracle; npm run typecheck; npm run lint (biome); uv run python scripts/check_oracle_drift.py -- clean; uv run pytest tests/unit/memory -k 'task or journey or week' -- all passing

Checks status: passed

## E2E

Decision: required

Evidence: e2e CLI suites via spawnFrontDoor over real backup-gated writes on copied DBs (tasksWriteCli/weekViewCli/tasksImportSyncCli.test.ts), incl. the ambiguous-vs-not-found asymmetry demo, a full sync-config->sync->re-sync cycle, and front-door.log redaction checks; plus a live end-to-end real-DB-copy harness run (generate_demo_memory_db.py -> real_db_copy_parity.py) confirming tasks/week probe families both report overall_match: true alongside every pre-existing DS2 probe family, exit 0

## Navigator Validation

Route: docs/project/roadmap/cv22-typescript-core-port/cv22-ds7-command-burn-down/cv22-ds7-us2-content-planning-writes/test-guide.md#navigator-validation -- run the listed tasks add/list/doing/delete/done/import/sync-config/sync/week-view sequence plus journal/week-plan on a copied DB with --db-path pointed at the copy

Navigator accepted: yes

Expected observation: TS front-door output and resulting DB rows match the Python oracle exactly for every deterministic command; journal/week plan still print their unchanged Python output

Pass condition: rendered stdout and affected rows identical to Python for every deterministic command, including the ambiguous-vs-not-found asymmetry; journal/week plan byte-identical to current Python behavior; front-door log shows no titles, payloads, or the sync-file path

Fail condition: any rendered-output or row divergence from the Python oracle; the ambiguous-prefix case converging to one message; any gated command changing behavior; any title/payload/path appearing in the front-door log; any write touching a non-copied database

## Missing Evidence

- none
