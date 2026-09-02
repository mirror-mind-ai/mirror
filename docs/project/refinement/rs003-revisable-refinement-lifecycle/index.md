[< Refinement Workbench](../index.md)

# RS003 — Revisable Refinement Lifecycle

## Framing

The Change Request lifecycle models one item worked linearly from capture to completion.
Dogfooding across the `kia-backend` and `kia-desktop` journeys found that refinement work
does not move that way. Plans are invalidated by the reviews that exist to invalidate them.
Attention moves between items when fixing one defect uncovers its sibling. Defects are
resolved by other defects. The scope of a story changes as it accumulates work.

In each case the runtime had no vocabulary for what actually happened, and the Navigator
had to choose between an inaccurate record and no record at all. The recurring shape is
that the Workbench models forward progress and terminal exit, but not revision, resumption,
or return.

This story groups the refinements that give the lifecycle a way to revise, resume, and
resolve-by-another-route, together with the storage change that makes those records honest.
It does not redesign the Ariad phase model and does not introduce concurrent multi-CR
execution.

## Outcome

A Change Request can be corrected, resumed, and closed truthfully, and its document shows
what was planned, what was implemented, what evidence was accepted, and how it closed.

## Boundaries

- Amendment is append, not replacement. Capture integrity is preserved.
- Preserve the one-in-flight invariant unless field evidence demands otherwise.
- Existing records must remain readable. No storage change may drop `outcome_notes`
  content that is the only surviving record for a closed Change Request.
- Revision is permitted before implementation. After implementation starts, corrections
  belong in validation evidence or a new Change Request.
- Do not add authority to commit, push, merge, publish, or release.
- Keep document backlog status in the canonical [Workbench index](../index.md).

## Change Requests

- [CR010 — Re-plan a reviewed Change Request without destroying plan history](cr010-replan-with-plan-history.md)
- [CR011 — Resume a stranded Change Request](cr011-resume-stranded-change-request.md)
- [CR012 — Close a Change Request superseded by another](cr012-supersede-change-request.md)
- [CR013 — Amend Refinement Story and Change Request text during refinement](cr013-amend-story-and-request-text.md)

## Provenance

These four Change Requests were authored from seven field captures recorded on the `mirror`
journey of the legacy SQLite Workbench between 2026-07-23 and 2026-08-06, during dogfooding
of Ariad on `kia-backend` and `kia-desktop`. Three of those captures reported the same
re-plan defect on three separate occasions; they are consolidated here as CR010. Two
reported the same cursor-strand defect from different angles; they are consolidated as
CR011.

The consolidation is itself evidence for CR012: the duplicates accumulated because the
register had no way to mark a capture as resolved-elsewhere, and no way to find that a
defect had already been reported.

The identifiers here are new project-wide IDs. Legacy database display codes are not
imported and do not define them, per the Artifact Convention. These documents supersede
the corresponding SQLite rows, which are historical and are not a competing authority.
