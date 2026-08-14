[< RS003](index.md) · [Canonical status](../index.md#change-requests)

# CR009 — Resume A Stranded Change Request

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

Pending. Capture does not authorize a lifecycle change.

Two candidate directions, for planning rather than prescription:

1. A verb that makes an existing in-flight Change Request active again without resetting its
   lifecycle state — `change-request resume --change-request-id <id>` — or relaxing `select`
   to accept any non-terminal status and move the cursor without changing status. The second
   is smaller but overloads `select`, whose current meaning is "begin this CR"; a distinct
   verb reads better in the flow surface.
2. Relaxing the advancing verbs to accept an explicit `--change-request-id` for any Change
   Request in the active Refinement Story, treating the cursor as a convenience default
   rather than a precondition. This matches how `park`, `reject` and `promote` already
   behave and addresses the whole class at once.

Option 2 is the structural fix, but it cannot be done while phase state lives on the cursor.
If planning confirms that `last_refinement_event` is the real blocker, moving phase state
onto the Change Request record is a prerequisite, and it overlaps directly with the
append-only history proposed in [CR008](cr008-replan-with-plan-history.md). The two should
be planned together.

Open questions for planning:

- Should resuming emit a `REFINEMENT_FLOW_EVENT`, or is cursor movement not a lifecycle
  fact?
- Should more than one Change Request be allowed in flight at once, or is the one-active
  invariant worth preserving with resume as the only way to switch? The latter is simpler
  and probably right.
- Does allowing an advancing verb on a non-active Change Request lose the confirmation
  discipline the cursor currently enforces?

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

## Outcome

Pending.
