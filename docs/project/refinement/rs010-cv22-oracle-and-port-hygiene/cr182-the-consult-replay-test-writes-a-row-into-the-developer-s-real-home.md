[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR182 — The consult replay test writes a row into the developer's real home

## Problem

`front door runs consult ask through TS replay route` in
`ts/test/frontDoor/externalRoutes.test.ts` spawns the front door with replay fixtures
for credits and the model (`MIRROR_TS_CREDITS_REPLAY`, `MIRROR_TS_CONSULT_LLM_REPLAY`)
but no `MIRROR_HOME` or `DB_PATH`. `spawnFrontDoor` (`ts/test/helpers/frontDoor.ts`)
inherits `process.env`, so the child resolves the developer's own mirror home and
`consult` logs its synthetic call there. Every `npm test` writes one row to the real
development home's `llm_calls`: `role=consult`, `model=google/gemini-2.5-flash-lite`,
3 prompt tokens, 4 completion tokens, `cost_usd=0.001`.

Found 2026-10-28 by CV9.DS9.US3's validation, reading the ledger for the new pin's
rows: the development home (`vinicius-dev`) holds 10 to 19 such rows a day since at
least 2026-10-20, 8 on the day it was found.

## Expected Behavior

A test never writes to a home the developer uses. The replay test runs the front door
against a scratch home (`MIRROR_HOME` under the test's `freshDir`), as the search test
beside it already does through `DB_PATH`, and the ledger it writes to is deleted with
the directory. `spawnFrontDoor` could refuse to run without one of the two, so the
next test cannot inherit the real home by omission.

## Impact

Low for correctness, real for trust: the ledger is the evidence `runtime status`,
cost reports, and CV9.DS9's post-swap check read, and it holds rows no model call made.
Any 30-day cost or call count from the development home is inflated by about 400
fake consult rows a month. CR163 fixed the test suite leaving temp homes behind; this
is its sibling, the suite writing into the home it should never touch.

## Plan Or Decision

Captured, unassigned, 2026-10-28, from CV9.DS9.US3's Debt Review.

When pulled: pass `MIRROR_HOME: dir` in the replay test; consider a guard in
`spawnFrontDoor` that requires `MIRROR_HOME` or `DB_PATH` in the env it is given;
delete the synthetic rows from the development home after a verified backup
(`role='consult' and prompt_tokens=3 and completion_tokens=4 and cost_usd=0.001`).

## Evidence

- `ts/test/frontDoor/externalRoutes.test.ts`, the replay test's env.
- `ts/test/helpers/frontDoor.ts`, `spawnFrontDoor`: `{ ...process.env, ...env }`.
- The development home's ledger, 2026-10-28: eight rows at the minutes `npm test` ran.

## Outcome

Pending: captured, not planned.
