[< Refinement Workbench](../index.md)

# RS005 — Durable Refinement Publication

## Framing

In one week of real use, refinement work leaked in three ways. Two clones allocated
the same Change Request IDs and neither published — eight days of invisible
divergence, resolved by renumbering (PR #37). Captures were authored and committed
in the production clone. And an uncommitted edit in that clone was silently erased
by machinery that treats production working trees as disposable.

These are two diseases, not three accidents: work stopping partway through
publication (every rung of modified → committed → pushed feels like completion, but
the system's boundary of existence is origin), and authoring in places the
surrounding machinery may reset. Both share one enabler — nothing renders the
divergence, so it accumulates invisibly until it collides, strands, or evaporates.

The design held where it applied: Git exposed the collision loudly, exactly as the
protocol intended — but only once the work reached Git. This story closes the gap
below origin. Prevention is protocol (numberless drafts, allocation-as-publication,
clean session end, production read-only); detection is runtime (divergence made
visible at session boundaries).

## Outcome

Refinement work survives its session: drafts cannot collide, claims cannot strand,
divergence cannot hide, and nothing worth keeping lives where machinery may erase it.

## Boundaries

- No locks, ID reservation, sync daemons, or capture databases — Git remains the
  sole concurrency authority; the protocol stays norms plus surfaces.
- Framework behavior changes (surfaces, skill text) are captured, planned, and
  validated as their own CRs — protocol amendments do not silently change code.
- Keep document backlog status in the canonical [Workbench index](../index.md).

## Change Requests

- [CR015 — Amend the protocol for durable publication](cr015-amend-protocol-for-durable-publication.md)
- [CR016 — Surface refinement-tree divergence at session boundaries](cr016-surface-refinement-divergence-at-session-boundaries.md)
