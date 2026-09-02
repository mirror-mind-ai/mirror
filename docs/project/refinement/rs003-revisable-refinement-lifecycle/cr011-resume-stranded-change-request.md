[< RS003](index.md) · [Canonical status](../index.md#change-requests)

# CR011 — Resume A Stranded Change Request

## Problem

A Change Request that is in flight but no longer the active one cannot be advanced or
resumed. It is stranded in whatever lifecycle state it reached, permanently.

Two guards close the loop against each other in `src/memory/builder/workbench.py`:

```text
:169  select    -> _require_status(cr.status, {"captured"}, "select")
:571  _require_active_cr(...)  -- required by confirm, plan, mark_implemented, validate, done
```

`select` refuses anything that is not `captured`, so an `implemented` or `validated` Change
Request cannot be re-selected. Every advancing verb requires the Change Request to be the
cursor's active one. Selecting a second Change Request overwrites
`active_change_request_id`, and from that moment the first can neither be advanced nor
returned to active.

The only verbs that accept a non-active Change Request are `park`, `reject` and `promote`,
via `_require_terminable_cr` at `:587` — whose own docstring records that this was a
deliberate carve-out because those "are decision exits that commonly apply to a CR that is
not currently in flight." The same reasoning was never extended to resuming a lifecycle.

The displacement is silent. `select` gives no warning that it is abandoning a non-terminal
Change Request.

The likely root cause is that per-Change-Request phase state is stored on a single-slot
cursor rather than on the record itself. `_require_confirmed_cr` reads
`cursor.last_refinement_event`, not any field of the Change Request:

```python
if (
    cursor is None
    or cursor.active_change_request_id != change_request_id
    or cursor.last_refinement_event != "change_request_confirmed"
):
    raise ValueError("confirmed Change Request is required to mark implemented")
```

Because the cursor has one slot and holds the phase, only one Change Request can progress.

## Expected Behavior

1. A non-terminal Change Request can be made active again without resetting its lifecycle
   state, so work that is finished in fact can be recorded as finished.
2. `select` refuses, or at minimum warns, when the current active Change Request is in a
   non-terminal state — naming it and telling the Navigator to close or park it first. This
   turns a silent trap into a visible one.
3. A Change Request already in `validated` can reach `done` without depending on cursor
   position, since a validated item is no longer in flight.

## Impact

Work that is implemented, committed, Navigator-validated and shipped cannot be recorded as
complete. What is lost is not the work but the closure record: the commit SHA, the CI
outcome, and the done note. A Refinement Story cannot be closed cleanly while any attached
Change Request is stranded, so the strand propagates upward and blocks story closure.

The runtime models one in-flight Change Request at a time, but refinement does not work
that way. Discovering a sibling defect while fixing the first one, and validating both with
one piece of evidence, is not exotic — it is the normal texture of refinement work. The
Workbench correctly encourages splitting a Change Request when its scope turns out to be too
broad, then penalises the split by making only one of the resulting records completable.

## Plan Or Decision

Decision: add a distinct public `change-request resume --change-request-id <id>` verb.
Do not overload `select`, because `select` means "begin a captured CR" and intentionally
changes `captured` to `active`. `resume` means "restore the active pointer for a CR whose
status already represents lifecycle progress" and must not mutate the Change Request row.

Scope:

1. `resume` accepts a Change Request only when its Refinement Story is the active RS for the
   Journey. This preserves the existing RS/Journey authority guard instead of letting a CR
   switch active RS implicitly.
2. `resume` refuses `captured` with guidance to use `select`, because a captured CR has no
   advanced lifecycle state to preserve.
3. `resume` refuses terminal CRs (`done`, `parked`, `rejected`, `promoted`) with the same
   terminal-state boundary used by the terminal verbs.
4. `resume` preserves status, outcome notes/evidence, timestamps, position, provenance, and
   RS link by updating only the Refinement cursor: active RS remains the same, active CR
   becomes the resumed CR, and `last_refinement_event` becomes `change_request_resumed`.
5. The existing advancing verbs remain status-driven: a resumed `implemented` CR can run
   `validate`; a resumed `validated` CR can run `done`.
6. The transition renders the existing deterministic `REFINEMENT_FLOW_EVENT` Ariad surface
   with a `RESUMED` event, stage-aware ribbon position, and next-move guidance.

This is intentionally the narrow recovery primitive. It preserves the one-active-CR
invariant and does not move phase state onto the Change Request record. The broader
multi-CR/history redesign remains future work for CR010/RS003 if field evidence demands it.

## Evidence

Reported twice from the field before consolidation.

**2026-07-27, `kia-backend`** — CR003 was confirmed, planned, implemented and committed.
CR006 was discovered while implementing CR003, because the sibling route carried the
identical defect, and was captured, selected, planned, implemented and committed in the same
session. A single live desktop run then validated both routes at once. CR006 validated.
CR003 could not: `select` refused it because its status was `implemented`, not `captured`,
and `validate` refused it because it was not the active Change Request. Its validation
evidence existed, was accepted by the Navigator, and had nowhere to go. RS001 on that
journey could not be closed cleanly as a result.

**2026-07-27, `kia-desktop`** — CR079 was validated with Navigator acceptance, committed as
`3360853` and pushed to main. Before CI finished, CR084 was selected to start the next item.
That single `select` stranded CR079 permanently. Navigator decision was to accept the
strand, since `validated` is a truthful state, rather than mislabel shipped work as
`rejected` or `parked`.

Facts that had nowhere to live in CR079's own record, preserved here because no amend verb
exists: CR079 shipped as `kia-desktop` commit `3360853` ("fix(workspaces): degrade the
bootstrap instead of shouting a toast (CR079)"), 15 files, pushed to main 2026-07-27. Local
gates green before push: `tsc` clean, 256 unit tests, 11/11 web E2E. Its validate evidence
remains stale on one point, since it truthfully said "NOT COMMITTED, NOT PUSHED" at the time
it was written.

Guard line numbers and the `_require_confirmed_cr` body above were re-verified against
`src/memory/builder/workbench.py` at transcription time and still hold.

2026-08-14 — Re-verified against `origin/main` @ `688271f`: no resume, unpark, or reopen
verb exists for Change Requests in `src/memory/`. Still valid.

Additional production reproduction:

**2026-08-30, `nautilus-harness` production** — RS012 had CR028 in `implemented`.
CR030 was selected, implemented, validated, and marked `done`, clearing the active CR
pointer. The Navigator then validated CR028, but `change-request validate` refused with
`Error: active Change Request is required`; trying to reselect CR028 refused with
`Error: cannot select from status 'implemented'; expected captured`. The Workbench had no
public operation to make the non-terminal implemented CR active again without direct SQLite
edits or artificial status regression.

Implementation evidence in Mirror Dev:

- Added `resume_change_request` in `src/memory/builder/workbench.py`.
- Wired `memory build change-request resume` through `src/memory/cli/build.py`.
- Extended `REFINEMENT_FLOW_EVENT` rendering for `change_request_resumed` in
  `src/memory/builder/workbench_surfaces.py`.
- Added the required two-CR reproduction: CR A reaches `implemented`, CR B reaches `done`
  and clears the pointer, CR A resumes without row mutation, then validates and reaches
  `done`.
- Added coverage that a `validated` stranded CR resumes and reaches `done`, and terminal
  CRs cannot resume.

Navigator validation accepted on 2026-08-30 after independent review of commit `e5f2005b`.
The Navigator re-ran:

```bash
uv run pytest tests/unit/memory/builder/test_workbench.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder/workbench.py src/memory/builder/workbench_surfaces.py src/memory/cli/build.py
git diff --check
```

All passed. The Navigator confirmed the behavior covers the Nautilus case exactly: an
`implemented` CR that lost the active pointer can resume without mutating the CR record and
continue to Validate; a `validated` CR can continue to Done; terminal states remain closed.

Full-suite failure classification before closure:

- `test_operations_run_api_executes_runtime_diagnose_through_controlled_command` failed on
  HEAD and failed the same way on parent `e5f2005b^` in an isolated worktree/home. This is
  baseline debt, not a CR011 regression. It remains tracked as
  [D-014](../../debt.md), with status Carried.
- `test_process_death_releases_journey_lock` failed once during the complete suite, but passed
  3/3 isolated on HEAD and 3/3 isolated on parent `e5f2005b^`. This is classified as an
  environmental flake not reproduced in isolation. No new debt is recorded without further
  evidence.

Debt Review accepted by the Navigator on 2026-08-30: CR011 introduced no new debt. D-014
remains carried as pre-existing debt, and the isolated process-death lock evidence does not
justify a new debt item.

## Outcome

Done. CR011 adds an explicit public `change-request resume` flow that restores the active
cursor for a non-terminal advanced Change Request without mutating the Change Request record,
so stranded `implemented` and `validated` CRs can complete through the ordinary public
Workbench lifecycle. Terminal CRs remain closed. No push, release, stable promotion, or
production runtime update was performed.
