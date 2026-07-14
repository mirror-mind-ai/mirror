# Validation — CV22.DS4.US4

## Status

Passed

## Automated Checks

- ts: npm run typecheck + biome check (exit 0) + node:test 119 pass, incl. front-door identity-set spawn E2E and live-write backup-guard tests

Checks status: passed

## E2E

Decision: required

Evidence: Automated spawn E2E (test/frontDoor/identityWriteCli.test.ts): node cli.ts identity set against a DB copy — create then update, pre-write backup taken, row verified; empty-content rejected without writing. openDatabaseForWrite fails closed without a verified backup. Production mm-identity skill cutover deferred to post dev-dogfood.

## Navigator Validation

Route: Take a backup, then: node ts/src/frontDoor/cli.ts identity set <layer> <key> --content '...' --db-path <dev-db>; identity get to confirm; run set again to confirm update+inherit; confirm a journey write still routes to Python

Navigator accepted: yes

Expected observation: identity set writes to the DB via TS with a generated id (8 hex) and microsecond ISO-Z now, printing the same ✓ {layer}/{key} created|updated line; unported commands stay on Python; no user-visible change

Pass condition: row created/updated exactly as Python would (metadata inherited on update); pre-write backup taken; fallback intact

Fail condition: write throws (copy-guard/backup), wrong/missing row, divergent success line, or an unported command wrongly routed to TS

## Missing Evidence

- none
