[< RS010](index.md)

# CR058 — Wait for completion, not a wall-clock budget, in the runtime-diagnose web test

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`tests/unit/memory/web/test_server.py::test_operations_run_api_executes_runtime_diagnose_through_controlled_command`
posts a `runtime-diagnose` operation and then polls the run through
`wait_for_run`, which gives up after 40 polls of 50 ms — a two-second budget.
The operation spawns `python -m memory runtime diagnose` as a subprocess;
on a developer machine where interpreter start-up plus the diagnose itself
exceeds two seconds, the run is still `running` when the budget expires and
the test fails with `Operation run did not finish`.

It passes in CI on every push and fails locally on the machine that carried
CV22.DS7.US10, on a clean tree with all story work stashed. The behavior
under test is correct; the test's clock is wrong.

## Expected Behavior

The test waits for the run to leave `queued`/`running` bounded by a
generous ceiling (tens of seconds, since the ceiling only matters when
something is genuinely stuck), not by a budget tuned to the CI runner. A
slow but correct subprocess never fails the test; a hung one still does.

## Impact

Every local run of the Python suite on an affected machine reports one
failure that has to be recognized and deselected by hand — exactly the kind
of noise that trains people to ignore red. It has already been carried
through one full story's verification checklist as "known, unrelated".

## Plan Or Decision

Raise `wait_for_run`'s ceiling (for example 30 s with the same 50 ms poll)
and keep the assertion message. Optionally, have the diagnose operation in
the web layer report progress so the wait can distinguish slow from stuck;
that is a product change and belongs to its own decision if wanted.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Observed during CV22.DS7.US10 (2026-09-03 and 2026-09-07), confirmed as a
local-environment artifact against green CI on the same tree, and captured at
that story's Debt Review on 2026-09-07.
