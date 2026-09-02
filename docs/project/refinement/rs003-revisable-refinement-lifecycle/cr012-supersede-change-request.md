[< RS003](index.md) · [Canonical status](../index.md#change-requests)

# CR012 — Close A Change Request Superseded By Another

## Problem

A captured Change Request can become true by other means: the defect it describes gets
fixed inside a different, larger Change Request. The work item is redundant, the defect is
genuinely resolved, and there is no verb that says so.

What the runtime offers, and why each is wrong for this case:

| Verb | Why it does not fit |
|------|---------------------|
| `done` | Unreachable from `captured` without walking select, confirm, plan, mark-implemented and validate — fabricating a plan that was never written and an implementation record for work performed under another Change Request. That is a false audit trail. |
| `reject` | The only reachable terminal state, but it means "decided no". The defect was not declined; it was fixed. The register then glance-reads as a rejected defect sitting next to the commit that fixed it. |
| `discard` | Deletes the record. The capture was legitimate and the trail is worth keeping. |
| `park` | A deliberate defer with a revisit trigger. There is nothing to revisit. |
| `promote` | A level change to Delivery Work. Not that either. |

## Expected Behavior

1. A Change Request resolved by another Change Request can reach a terminal state directly
   from `captured`, without walking the implementation cycle and without recording a
   decision that was never made.
2. The superseding Change Request is recorded as a first-class reference, not as prose
   inside a reason field.
3. Rendering reads as resolved-elsewhere, not as declined.
4. Ideally the pointer works in both directions: the superseding Change Request gains a
   subsumed list, so the trail is navigable from either end.

## Impact

Duplicate and overlapping captures are normal in an active refinement field, especially when
a large Change Request absorbs a smaller one discovered mid-flight. On `kia-desktop` RS004
alone there were several near-duplicates: CR033/CR078, CR054/CR079, CR065/CR079. Closing one
as subsumed by another is routine work, and the lifecycle has no shape for it.

Without the verb, the register accumulates either false tombstones or open items that are
already fixed. Both degrade the glance-read that makes the register useful, and both make it
harder to notice that a defect has already been reported — which is how this Refinement
Story came to contain three separate captures of the same re-plan defect.

## Plan Or Decision

Pending. Capture does not authorize a lifecycle change.

Suggested direction, for planning rather than prescription: a terminal verb such as
`supersede --by <cr-id>`, or `close --as duplicate|superseded --by <cr-id>`, reachable from
`captured` without walking the implementation cycle, recording the superseding identifier as
a structured field.

Open questions for planning:

- Should `supersede` be reachable from any non-terminal status, or only from `captured` and
  `planned`?
- Does the superseding Change Request need to be in the same Refinement Story, or may it be
  anywhere in the journey? The field cases crossed stories.
- Should the reverse pointer be stored, or derived at render time from the forward pointers?

This Change Request is related to but distinct from
[CR010](cr010-replan-with-plan-history.md). Both are the same underlying shape: the
lifecycle models the happy path of one item worked to completion, and has no vocabulary for
items whose truth changed by another route.

## Evidence

**2026-07-27, `kia-desktop` CR087.** The defect it described had been fixed inside CR079.
`done` was refused twice — first "Change Request does not belong to the active Refinement
Story" because it was unassigned, then "active Change Request is required". The remaining
options were all inaccurate.

Field decision (Navigator: Vinícius) was to use `reject`, with a reason field that opens
"Superseded" and closes with "Read this as CLOSED-SUPERSEDED", plus an explicit note that
the verb is inaccurate. The record is honest only because the reason text carries what the
status cannot.

The same Navigator had rejected reject-as-supersede earlier in the same session, when
weighing it for CR079 itself, on the grounds that it produces a misleading tombstone. The
decision was reversed under the constraint that no other verb was reachable.

Referenced records: `kia-desktop` CR087 (`c55a8104`), CR079 (`fe210d5c`), commit `3360853`.

2026-08-14 — Re-verified against `origin/main` @ `688271f`: no supersede verb exists
anywhere in `src/memory/`. Still valid.

## Outcome

Pending.
