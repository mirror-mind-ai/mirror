[< RS005](index.md) · [Canonical status](../index.md#change-requests)

# CR015 — Amend The Protocol For Durable Publication

## Problem

The collaboration protocol allocated a project-wide ID at capture time (step 3 of
the capture route) and treated publication as a later, unspecified follow-up. That
made a locally held ID a legitimate state — and local state proved fragile three
ways in one week:

- the dev clone drafted four CRs under CR008–CR011 and sat unpublished for eight
  days while the production clone committed two different CRs as CR008/CR009 —
  a namespace collision resolved by renumbering (PR #37);
- refinement captures were authored and committed in the production clone at all;
- an uncommitted edit to CR004's document, visible in the production working tree
  across two sessions, was erased by something before the third — content unknown,
  unrecoverable.

The protocol's concurrency safety ("let Git expose conflicts") only engages at
push. Below origin, nothing collides, nothing warns, and nothing survives by
guarantee.

## Expected Behavior

Three norms, no machinery:

1. **Drafts are numberless.** A capture-in-progress carries a slug, never a
   `CRNNN`/`RSNNN`. It can live anywhere for any time; it claims nothing, so it
   cannot collide.
2. **Allocating an ID is publication.** Number, canonical row, and push to origin
   happen as one act in one session. A claimed ID that exists only in a local
   working tree is not a state the process has.
3. **Sessions end clean.** A session that touched the refinement tree ends
   published, or ends with the divergence named in the handoff. Production clones
   are read-only for refinement authoring.

## Impact

Collisions become structurally impossible rather than merely resolvable — the only
shared resource (the number) can no longer be held privately. The stranding window
shrinks from unbounded to one session. Work stops being authored where runtime
machinery may erase it. Capture stays light: drafting requires no ceremony at all;
the ceremony attaches only to claiming shared namespace, which was already the
moment of consequence.

## Plan Or Decision

Shape proposed by the thinker dialogue of 2026-08-14 and approved by the Navigator
in session ("All of this makes sense. I like those ideas. Let's put them in
practice."). This CR implements the three documentation norms; the runtime
detection surface is captured separately as
[CR016](cr016-surface-refinement-divergence-at-session-boundaries.md).

Affected files: `rs002-collaborative-refinement-work/collaboration-protocol.md`
(Authority Boundary bullet; capture route rewrite; new section 9), canonical
`index.md` (Artifact Convention line).

## Evidence

The incident record is PR #37 and its branch history, including the byte-for-byte
preservation of the colliding drafts on `refinement/rs003-drafts-as-written`.
The amendment itself landed in this CR's delivery branch as commit
"Amend the collaboration protocol for durable publication".

Dogfooding note: CR015 and CR016 are the first captures published under the rule
they introduce — IDs allocated and pushed in the same session, same act.

## Outcome

Pending Navigator validation of the amended protocol text.
