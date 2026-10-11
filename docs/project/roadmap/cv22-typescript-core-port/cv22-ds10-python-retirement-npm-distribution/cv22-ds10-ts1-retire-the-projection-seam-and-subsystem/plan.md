# Plan — CV22.DS10.TS1

**Revision:** 3 — the retirement plan. Revisions 1–2 planned a port and are
[kept as declined](plan-declined-port-revision-2.md).

## Objective

Remove the last runtime dependency of the TypeScript core on Python — the post-commit
projection refresh — together with the `journey_projections` subsystem it fed, so that
every Explorer and Builder write is self-sufficient, `.mirror/projections` is no longer
published, and `mirror.journey-projections@1.0` is sunset with a documented cutoff and
nothing user-visible changes for current Mirror users.

## What Is True Before This Story

- Every TypeScript Explorer write (`exploreRoute.ts`, 3 sites) and every Builder cursor
  write (`deliveryCursor.ts:461,486`, reached through `CursorWriteDeps.requestProjectionRefresh`
  from `closure.ts`, `deliveryStoryClosure.ts`, `deliveryStoryPlan.ts`, `plan.ts`,
  `storyPlanPreauthorization.ts`, `argv.ts`, `buildRoute.ts:387`, `cli.ts:1689`) spawns
  `uv run python -m memory journey-projection refresh` after commit. ~52 references
  across 16 TypeScript files, including 4 test files.
- On the Python side, `Store.request_projection_refresh` is called from `builder/workbench.py`
  (6), `builder/lifecycle.py` (5), `builder/delivery_story_closure.py` (4),
  `services/explorer_story.py` (3), `builder/delivery_cursor.py`, `delivery_story_plan.py`,
  `story_plan_preauthorization.py`; `client.py` builds the coordinator (6);
  `extensions/api.py` (7) and `loader.py` (2) expose `api.journey_projections`. 44
  references across 11 modules outside the subsystem, plus three tests outside it
  (`extensions/test_loader.py`, `builder/test_plan_preauthorization_concurrency.py` and its
  worker).
- `filelock` has no other user.
- Nothing in this repository reads `.mirror/projections`. Verified 2026-09-19.

## Scope

**TypeScript — the seam goes, the deps shape shrinks.**

- Delete `ts/src/explorer/projectionRefresh.ts` and `ts/test/explorer/projectionRefresh.test.ts`.
- Remove `requestProjectionRefresh` from `CursorWriteDeps` and every threading of it in
  `ts/src/builder/`; remove `projectionRefresh` from `exploreRoute.ts`'s deps and the three
  `.request(...)` calls; remove the `createPythonProjectionRefresh` wiring in `cli.ts` and
  `buildRoute.ts`.
- Remove `projectionRefreshRequested` and `refreshRequested` from `ts/src/explorer/story.ts`
  and its callers — the "did this write change projectable state" computation has no
  consumer once nothing is refreshed.
- Update `ts/test/explorer/story.test.ts`, `ts/test/builder/cursor.test.ts`,
  `ts/test/builder/lifecycle.test.ts` for the narrower deps.
- **Add a no-spawn guard**: an Explorer write and a Builder cursor write, run under a
  `node:child_process` spy, spawn nothing. This is the acceptance test; it must exist
  before the deletion so it is seen to fail against the seam and pass without it.

**Python — the subsystem goes, and its wiring.**

- Delete `src/memory/journey_projections/`, `src/memory/cli/journey_projection.py`, the
  `journey-projection` entry in `__main__.py`, `tests/unit/memory/journey_projections/`,
  `tests/unit/memory/cli/test_journey_projection.py`,
  `tests/integration/memory/journey_projections/`, `tests/fixtures/journey_projections/`.
- Remove `Store.request_projection_refresh` and its 21 call sites; remove the coordinator
  from `client.py`; remove `api.journey_projections` from `extensions/api.py` and the
  loader's wiring. A Python extension that still touches `api.journey_projections` gets a
  clear `AttributeError`-free refusal naming the removal — the compat host (TS2) decides
  how that reaches the extension author, but this story must not leave a bare
  `AttributeError`.
- Update the three outside tests. Remove `filelock` from `pyproject.toml` and `uv.lock`.

**Docs and contract.**

- `REFERENCE.md`: the `journey-projection` row and the *Journey Projection Contract*
  section. `docs/product/extensions/api-reference.md`: the `journey_projections`
  section. `docs/product/architecture.md`: the Journey projections section becomes a
  retirement note.
- Release note: the cutoff (see index). `docs/releases/` next version.
- The DS10 parent gate is already rewritten; the CV23 index already carries the sunset;
  the decision is already recorded. This story checks them off in its Done.
- RS001's CR017 (*every mutating Ariad command warns that the Operational projection
  failed*) becomes moot: flagged for the Navigator to reject as superseded, not touched
  here.

## Non-Goals

- No TypeScript projection code. Nothing is built.
- No Mirror Desktop work. Its inventory is in the parent package.
- `journey export-registry` / `journey mutate` (**TS4**), CR089 (RS009).
- The extension compatibility host (**TS2**).
- Deleting `.mirror/projections/` trees from disk. They are gitignored and inert.
- Any change to how Explorer or Builder writes commit. Only the post-commit side effect
  is removed; the surfaces those commands render are byte-identical before and after.

## Plateaus

1. **Guard first.** Write the no-spawn test and watch it fail against the seam.
2. **TypeScript.** Remove the seam and the deps threading; tests green; guard passes.
   Commit: *the TypeScript core stops spawning Python on writes.*
3. **Python.** Delete the subsystem, its CLI, its tests and fixture, the wiring, and
   `filelock`; `uv run pytest` green. Commit: *the projection subsystem retires with a
   documented cutoff.*
4. **Docs and cutoff.** Reference, api-reference, architecture, release note. Commit.
5. **Validation and Done.** Navigator route below; gate items checked off in the parent.

Two Python-facing and one TypeScript-facing commit in one PR: any intermediate commit is
coherent (TypeScript without the seam still works against a Python that has it; the
spawn simply never happens).

## Acceptance Behavior

```text
Given a TypeScript Explorer write and a Builder cursor write, under a child_process spy
When  each commits
Then  zero processes are spawned, and the rendered surfaces are byte-identical to the
      pre-change goldens

Given the repository after plateau 3
When  `rg -l "journey_projection|journey-projection|projectionRefresh|filelock"` runs
Then  it matches only docs/project/ (roadmap, decisions, refinement) and docs/releases/

Given `uv run pytest` and `npm test`
Then  both are green with no skipped test that used to exercise the seam

Given a Python extension that calls api.journey_projections
Then  it receives a refusal that names the removal, not an AttributeError

Given Mirror Desktop bound to the last Python-bearing tag
Then  it is untouched — this story ships nothing to that tag
```

## Validation Route

**Automated:** the no-spawn guard; the existing Explorer and Builder surface goldens
(unchanged); `uv run pytest`; `npm test`; the `rg` residue check as a CI step or a test.

**Navigator-visible (E2E: required — the story's whole claim is "no process"):**

1. On this repository, run a Builder lifecycle transition on the active story with
   `fs_usage`/`ps` tracing or `MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS=1` set (a spawn would
   now fail loudly instead of silently). Expected: the surface renders exactly as before;
   no `uv` or `python` process appears; `.mirror/projections/current.json`'s mtime does
   not move. Pass: all three. Fail: any spawn, any surface diff, the mtime moving.
2. Run an Explorer write (`explore` story save). Same expectations.
3. Confirm `uv run python -m memory journey-projection capabilities` now answers
   "unknown command" from Python and the front door refuses it with the cutoff message.

## Implementation Contract

- TDD: the guard exists and fails before the seam is removed.
- Keep changes scoped to `CV22.DS10.TS1`. The Builder deps-type change touches many
  files; each touch is a removal, never a behavior change.
- Use `uv run` for Python commands and tests.
- Do not use `git add .`; commit only story-scoped files.
- Descriptive English commit messages explaining why.
- CI green on every push.

## Stop Conditions

- `scope_change_detected`
- `plan_rule_conflict`
- `failing_required_check_without_clear_fix`
- `navigator_decision_needed`
- A surface golden changes: the refresh was supposed to be invisible; if removing it is
  visible, something else depended on it and the story stops to find out what.
- A test outside the subsystem cannot be updated without changing behavior it was
  asserting — that is a hidden consumer.

## Review

Revision 2's panel review stands as the record for the port. For the retirement, one lens
was asked: **security** — does deleting a publisher leave anything half-guarded? No: the
subsystem's guards protected writes into `.mirror/projections`; with no writer there is
nothing to guard, and the trees left on disk are read only by a runtime this story does
not ship. The refusal for `api.journey_projections` is the one place a caller could be
surprised, and it is in scope.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
