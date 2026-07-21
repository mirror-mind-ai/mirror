# Review — CV22.DS6.TS1

## Status

Reviewed

## Debt Findings

- src/memory/db/schema.py's tasks table CREATE TABLE text is stale relative to true fresh-DB behavior: it shows scheduled_at/time_hint inline after due_date, but migration 004_tasks_temporal_fields actually ALTER TABLE ADD COLUMNs them onto the table migration 003_create_tasks already built, so on every real install they land at the end. schema.py's CREATE TABLE IF NOT EXISTS never fires for tasks in practice (migrations always create it first), so this is dormant/harmless — no behavior impact, discovered only because CV22.DS6.TS1's structural-parity test empirically proved SCHEMA-only against migrations-then-SCHEMA rather than assuming they match. Now explicitly documented in ts/src/db/schema.ts's true (correct) column order.

## Debt Decision

no_action

## Defer Reason

none

## Revisit Trigger

none

## Missing Decision

- none
