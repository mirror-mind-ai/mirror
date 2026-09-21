[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR091 — `operation_runs` outlived its only consumer

**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

CV22.DS10.US1 deleted the web console, which was the only thing that wrote
`operation_runs` and `operation_run_events`. What survives it:

- `src/memory/services/operation_runs.py` — `OperationRunService`, now constructed
  by `client.py` and called by nothing but its own unit test;
- two tables in the schema, declared in **both** engines
  (`src/memory/db/schema.py`, `ts/src/db/schema.ts`) and carried by the migration
  ledger and the schema-inventory snapshot;
- real rows: 28 in the TS sandbox home, more in production.

TypeScript never read or wrote either table — the console was Python-only, so the
port had nothing to port. The tables are therefore structure the TS core creates
on every fresh database for a consumer that no longer exists.

Found on 2026-09-19 during the post-US1 documentation sweep, when
`architecture.md`'s schema table still described the rows as "Mirror Web Console
operation runs".

## Expected Behavior

A decision, not a default. Three options, and they are not equal:

1. **Drop both tables** in a TS-authored migration. Cleanest end state; deletes
   user rows, which is the one thing this journey has consistently refused to do
   on a user's behalf (see US1's treatment of `<mirror-home>/web/preferences.json`
   and TS1's of `.mirror/projections`).
2. **Keep the tables, delete the service.** The dead Python goes, the schema keeps
   two inert tables and their rows. Cheap, honest, and leaves a reader asking why
   they exist — which is what the schema documentation is for.
3. **Keep both** until a future feature claims the shape. Only defensible if
   something actually wants an async operation ledger; nothing does today.

Whichever is chosen, `architecture.md`'s row and the schema inventory should say
what is true, and the retired-surface check should carry the disposition.

## Impact

Low and structural. Nothing breaks: the tables are inert, the service is
unreferenced, and no command touches either. The cost is that every new Mirror
database is created with two tables nothing will ever write, and a reader of the
schema cannot tell that from the schema.

It also matters for **TS5**, which deletes the Python core: `OperationRunService`
disappears with it whether or not anyone decides anything, leaving the tables
without even a nominal owner. Deciding before that is cheaper than discovering it
after.

## Plan Or Decision

Not planned. Captured during the documentation sweep that followed US1's closure,
and deliberately not folded into that story, which was already closed and whose
gate named only the console's own files.

Sequencing note: this is a **schema** decision, and schema custody transferred to
TypeScript in CV22.DS6 — so option 1 is a TS-authored migration, not a Python one.
Natural owner is **CV22.DS10.TS5** (Python deletion, which removes the service
regardless) or **TS4** (unported-surface cutoffs, which already carries a set of
retirements with documented cutoffs).

## Evidence

```text
$ grep -rln "services.operation_runs|operation_runs\." src/ tests/
src/memory/client.py
tests/unit/memory/services/test_operation_runs.py

$ grep -rn "operation_runs" ts/src --include=*.ts | grep -v "schema|migrations|Inventory|schemaState"
(no output — TypeScript declares the tables and never uses them)

$ sqlite3 ~/.mirror-minds/vinicius-ts/memory.db "select count(*) from operation_runs;"
28
```

## Outcome

Open.
