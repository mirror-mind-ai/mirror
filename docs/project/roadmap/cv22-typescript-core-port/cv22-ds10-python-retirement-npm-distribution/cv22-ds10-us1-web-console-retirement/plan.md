# Plan — CV22.DS10.US1

## Objective

Delete the web console and everything whose only consumer was the console — the process,
its read models, and the scene surface — then stop advertising it, so that DS10's
deletion and npm gates open on a Python core with no graphical surface left in it and no
TypeScript replacement built.

## What This Removes, By Layer

Three layers, found by inventory at Pull. Only the first was named in the gate.

| Layer | What | Lines |
|---|---|---|
| The console | `src/memory/web/` (39 files), the `__main__.py` entry, `tests/unit/memory/web/` | ~3,568 |
| Its read models | `surfaces/{atlas,workspace,evidence,objects,models,search}.py` + tests, and the `SurfaceService` composition in `client.py` | ~1,800 of 2,601 |
| Its LLM surface | `intelligence/scene.py`, its test, `evals/scene.py`, `tests/unit/memory/evals/test_scene_fixture_contract.py` | ~112 + fixtures |

`surfaces/{mode_transition,soul,explorer_story}.py` stay: they serve `cli/build`,
`cli/soul`, `cli/explore`, and `skills/mirror`, which are compatibility-only Python until
TS5 deletes them.

## Decisions This Plan Takes

**D1 — the `scene` eval retires with the surface it grades.** Recorded in the story index.
Its subject has exactly one production caller (`web/server.py:18`), which this story
deletes; keeping `workspace.py` alive to feed an eval of an unreachable feature would
preserve a measurement of nothing. Resolves the DS10 eval gate's open disposition for
`scene` and hands TS3 one fewer module with a reason.

**D2 — `<mirror-home>/web/preferences.json` is left in place, inert.** It exists in both
the sandbox and production homes (41 bytes, last written 2026-06-07). Deleting state under
a user's home on their behalf is not this story's authority, and an orphaned 41-byte file
costs nothing. The disposition is *recorded* rather than executed — which is what gate
item 5 asks for. Same posture the projection trees got in TS1.

**D3 — `SurfaceService` goes rather than shrinks.** After the deletions it would compose
nothing: the three survivors are imported directly by their CLI callers, never through the
facade. A facade over an empty set is worse than no facade. `client.surfaces` goes with
it.

## Scope

Exactly the three layers above, plus:

- `tests/unit/memory/test_main.py` — the dispatch patch on `memory.web.server.main`.
- `evals/runner.py` — `scene` leaves discovery; `eval --all`'s denominator drops by one.
- `README.md`, `REFERENCE.md`, `docs/getting-started.md` — the console sections and rows.
- `docs/product/architecture.md` — the `web/` and `surfaces/` package-map lines and the
  web read-model paragraphs.
- `docs/releases/pending-cutoffs.md` — the cutoff: what is gone, `mirror-gui` as successor,
  the preferences-state disposition, and that existing `<mirror-home>/web/` is inert.
- `docs/project/debt.md` — D-017 no longer cites `scene` as its live example.
- The DS10 parent's Workspace And Web Retirement Gate — six items checked off.

## Non-Goals

- No TypeScript web surface, endpoint, or static asset, now or as a stub. `mirror-gui`
  owns any future graphical surface, and a half-ported server left here would pre-empt it.
- No change to `mode_transition`, `soul`, or `explorer_story`.
- No change to the shared fencing helpers in `intelligence/prompts.py`, which serve four
  surviving surfaces.
- No deletion of state under any user's home.
- D-017 is not closed. Its arithmetic is unchanged for every other fenced module.
- No change to journey-hierarchy semantics: they are TypeScript's already and the retired
  DS7.US9 transferred nothing.

## Plateaus

1. **Prove the check, then cut the process.** Re-run the gate-item-2 sweep as a committed
   check, then delete `src/memory/web/`, the `__main__.py` entry and usage lines, and the
   console's tests. Update the dispatch test. Python suite green.
2. **The read models.** Delete the six web-only surface modules and their tests; remove
   `SurfaceService` and `client.surfaces` (D3). Suite green.
3. **The scene surface.** Delete `intelligence/scene.py`, its test, `evals/scene.py`, its
   fixture-contract test; drop it from eval discovery. `eval --all` runs with a smaller
   denominator rather than a failure.
4. **Docs and cutoff.** README, REFERENCE, getting-started, architecture, pending-cutoffs,
   D-017's example, the DS10 gate's six items.
5. **Validation and closure.** Route below.

Four commits, one per layer plus docs. Each is independently coherent: the console's
consumers are deleted before the things they consumed.

## Acceptance Behavior

```text
Given any runtime
When  a user runs `python -m memory web`
Then  it is an unknown command, and `--help` does not list it

Given the repository after plateau 3
When  `rg "memory\.web|SurfaceService|intelligence\.scene"` runs
Then  it matches only docs/project/ and docs/releases/

Given `uv run python -m memory eval --all`
Then  it runs with `scene` absent from the denominator rather than failing on an
      import of a deleted module

Given a user whose home has <mirror-home>/web/preferences.json
Then  the file is untouched and nothing reads it

Given README, REFERENCE, and getting-started
Then  no console is advertised, and the cutoff names mirror-gui

Given the surviving Python CLI
Then  `build load`, `soul`, and `explore` still render their mode-transition,
      soul, and Explorer surfaces unchanged
```

## Validation Route

**Automated:** `uv run pytest` and `npm test` green; `ruff check`/`format`; the residue
check; `check_doc_links`; `check_skill_command_parity`; `check_oracle_drift` advanced with
the reason (every drifted oracle is a module this story deletes or narrows).

**Navigator-visible (E2E: required):**

1. `uv run python -m memory web` → unknown command; `python -m memory --help` has no `web`
   row. Pass: both. Fail: either still answers.
2. `uv run python -m memory eval --all` → completes, `scene` absent, no import error.
   Pass: a smaller denominator and a clean run. Fail: a traceback or a skipped module
   reported as passing.
3. A real Mirror turn on Pi (`mirror load` or a Builder command) behaves identically. The
   console was never in that path; this proves the deletion did not reach it.
4. `ls ~/.mirror-minds/*/web/` still shows `preferences.json`, untouched.

## Implementation Contract

- Delete consumers before the things they consume, so no intermediate commit has a
  dangling import.
- TDD does not apply to a deletion; the assertion is the suite plus the residue check.
- Keep changes scoped to `CV22.DS10.US1`.
- Use `uv run` for Python commands and tests.
- Do not use `git add .`; commit only story-scoped files.
- Descriptive English commit messages explaining why.
- CI green on every push.

## Stop Conditions

- `scope_change_detected`
- `plan_rule_conflict`
- `failing_required_check_without_clear_fix`
- `navigator_decision_needed`
- The gate-item-2 sweep finds a dependency the Pull inventory missed — the gate says such
  a find is reported to the Navigator as a possible revisit trigger before deletion, never
  silently ported.
- A surviving surface (`mode_transition`, `soul`, `explorer_story`) turns out to need one
  of the six deleted modules — that would mean the importer split was wrong.
- `eval --all` cannot run without `scene` for a reason other than discovery — that would
  mean the runner's denominator is not as data-driven as `--all` claims.

## Review

No panel. The collaboration strategy asks for Plan review "for every story above a small
slice", and the judgment here is that a deletion whose gate-item-2 check passes cleanly,
whose importer split is mechanical, and which builds nothing is below that line. One lens
was applied by hand — **security**: deleting an HTTP server that binds a local port and
executes controlled commands removes attack surface rather than creating it; the shared
fencing helpers are untouched; and no authority, permission, or path-confinement rule
survives only inside the deleted tree. If the Navigator wants the panel, it is one command
and the plan waits.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
