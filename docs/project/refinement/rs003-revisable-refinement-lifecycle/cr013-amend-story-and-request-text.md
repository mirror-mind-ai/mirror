[< RS003](index.md) · [Canonical status](../index.md#change-requests)

# CR013 — Amend Refinement Story And Change Request Text During Refinement

## Problem

The Builder Workbench has no verb to change a Refinement Story's title or description after
creation. `refinement-story` exposes only `create`, `overview`, `pull`, `review`,
`coherence`, `close` and `park`. `change-request` likewise has no edit verb: `capture`,
`attach`, `discard`, `select`, `confirm`, `plan`, `mark-implemented`, `validate`, `done`,
`park`, `reject`, `promote`.

Reframing is refinement. A Refinement Story exists to hold work whose shape is still being
discovered; its title is a hypothesis about the grouping, and the grouping changes as Change
Requests accumulate. A model that can group work but cannot re-title the group forces the
title to be right on the first try, which contradicts what a Refinement Story is for.

The same argument applies to a Change Request whose scope narrows during refinement.

## Expected Behavior

1. A Refinement Story title and description can be corrected after creation, rendering a
   `REFINEMENT_FLOW_EVENT` surface like the other transitions.
2. A Change Request whose scope changes during refinement can have that change recorded in
   its own record, rather than only in a later `plan --summary`.
3. Amendment preserves what it replaced, consistent with the append-only direction proposed
   in [CR010](cr010-replan-with-plan-history.md). A capture's evidence must not drift away
   from what was actually observed.

## Impact

The runtime makes the drift permanent and pushes the correction into prose at Review — which
is neither machine-readable nor able to fix the rendered surface. A Refinement Story title
will therefore misreport its own scope at Review and Coherence, precisely the stages that
exist to catch incoherence.

The only supported path to a new title is a migration: `create` a new Refinement Story,
`attach` every Change Request to it, `park` the old one as superseded. That is five or more
commands; it discards the pulled and active state of the original story and forces a
re-pull; and it fragments the history of a story that never actually changed. It is
disproportionate for a text correction. The alternative, writing to storage directly, is
correctly forbidden by the operating rule.

## Plan Or Decision

Pending. Capture does not authorize a new verb.

Suggested direction, for planning rather than prescription:

1. `refinement-story rename --refinement-story-id <id> --title <t> [--description <d>]`,
   rendering a `REFINEMENT_FLOW_EVENT` surface like the other transitions.
2. Consider the symmetric `change-request amend` for title and body.

Open questions for planning:

- Should rename be allowed in every Refinement Story status, or blocked after `close`?
- Should the rename event appear in the story history surface, or is it metadata rather
  than a lifecycle fact?
- Does `amend` risk letting a Change Request's body drift away from the evidence it was
  captured with? If so, append-only amendment is safer than replacement — the same
  conclusion CR010 reaches for plans.

## Evidence

**2026-07-26, `kia-backend`.** RS001 was created as "Manage authentication hardening". A
later Change Request — an `/api/v1` guard and CORS defect breaking the desktop — was
correctly attached to it on the shared theme of authentication hardening, but the title then
under-described its contents: it named one surface (Manage console) while the story held two
(Manage console and API v1). There was no way to correct it.

**Same session, `kia-backend` CR003.** The record had to keep an over-broad body after CR004
and CR005 were split out of it, because there was no way to narrow it. `discard` was the
wrong tool, since it erases the analysis. The narrowing survived only in the `plan
--summary`.

Both instances arose from dogfooding the Workbench on the `kia-backend` journey, in the same
session that produced [CR011](cr011-resume-stranded-change-request.md).

2026-08-14 — Re-verified against `origin/main` @ `688271f`: no amend verb exists anywhere
in `src/memory/`. Still valid.

## Outcome

Pending.
