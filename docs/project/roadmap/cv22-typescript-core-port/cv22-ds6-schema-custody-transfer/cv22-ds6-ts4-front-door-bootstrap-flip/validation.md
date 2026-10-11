# Validation — CV22.DS6.TS4

## Status

Passed

## Automated Checks

- ts: npm run typecheck + npm run lint clean; npm run test = 332 pass / 0 fail / 0 skipped (firstRun no longer skipped)

Checks status: passed

## E2E

Decision: required

Evidence: Navigator smoke: fresh --db-path, empty PATH (uv proven ENOENT) -> journeys exit 0 'No journeys found.'; DB created journal_mode=wal, foreign_keys=1, _migrations=16; identity set exit 0, row persisted, pre-write backup written under backups/.

## Navigator Validation

Route: PATH='' NODE_OPTIONS=--no-warnings $(command -v node) ts/src/frontDoor/cli.ts journeys --db-path <fresh>/memory.db  (then inspect the created DB)

Navigator accepted: yes

Expected observation: journeys renders; memory.db created with WAL sidecar and a full _migrations ledger; no uv/Python spawned to bootstrap

Pass condition: exit 0 with real output; DB present and current-schema; bootstrap not routed to Python

Fail condition: nonzero exit, DB absent, or bootstrap delegated to Python

## Missing Evidence

- none
