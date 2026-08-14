[< RS005](index.md) · [Canonical status](../index.md#change-requests)

# CR016 — Surface Refinement-Tree Divergence At Session Boundaries

## Problem

Every failure in the 2026-08-14 incident was enabled by invisibility. Four drafted
CRs sat uncommitted for eight days; two committed captures sat unpushed; an
uncommitted edit evaporated — and all of it was plainly visible in `git status`
the entire time. No one asked, because nothing renders that state at the moments a
session actually looks: activation and finalization.

Builder activation already reads the journey, resolves the project path, and
renders orientation surfaces. It says nothing about whether the refinement tree it
is about to work on has uncommitted files, unpushed commits, or an origin that has
moved on.

## Expected Behavior

At Builder activation for a journey whose project carries a canonical refinement
index, the runtime renders a compact divergence line or surface when — and only
when — there is something to say: N files modified, M commits unpushed, origin
ahead by K. A clean tree renders nothing. The 6 Aug drafts would have been
un-ignorable on 7 Aug, in the first second of the next session.

At session finalization, the same check backs the protocol's "end the session
clean" rule (section 9): the runtime names what the session is about to leave
dangling, so the published-or-named decision is made consciously rather than by
forgetting.

## Impact

Prevention (CR015's norms) covers intentional behavior; this covers everything
else. Whatever survives the norms — an interrupted session, a crash, an agent
that stopped mid-capture — becomes visible at the next session boundary instead
of accumulating silently. This is the detection half of RS005's outcome.

## Plan Or Decision

Pending. Capture does not authorize implementation. Decisions for planning time:

- placement: extend the Builder Mode activation composition (`build load`) or a
  dedicated surface module; whether the finalize-session half is runtime behavior
  or `mm-build` skill text;
- scope: refinement tree only, or the whole project working tree with the
  refinement tree called out;
- alignment: the framework's `mm-build` skill capture text still describes
  capture-time ID allocation and should follow CR015's protocol (the skill already
  defers to the project's own convention, so this is drift cleanup, not a
  prerequisite);
- noise budget: the surface must stay one line when clean-ish and must never
  block activation.

## Evidence

The incident this detects is documented in [CR015](cr015-amend-protocol-for-durable-publication.md)
and PR #37. The eight-day invisibility window and the evaporated CR004 edit are
the motivating occurrences; both would have been surfaced at the next activation
under this behavior.

## Outcome

Pending.
