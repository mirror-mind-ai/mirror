[< Refinement Workbench](../index.md)

# RS002 — Collaborative Refinement Work

## Framing

The document-first Workbench can preserve shared Refinement Stories and Change
Requests in Git, but a second contributor and their Mirror still need a clear way to
see the field, know who is executing active work, and return a reviewable handoff.
Without that shared operating contract, collaboration depends on private context and
manual explanation even though the backlog itself is canonical.

This story groups the smallest refinements needed to make file-first Refinement Work
transferable between contributors. It does not add a shared database, Markdown parser,
synchronization service, watcher, lock manager, or custom Git protocol.

## Outcome

Achieved. A contributor using another Mirror can inspect the canonical Workbench,
capture or claim Refinement Work without hidden local state, and return a Git-backed
handoff that maintainers can review.

## Boundaries

- Keep `docs/project/refinement/index.md` as the sole authority for focus, ordering,
  and current status.
- Keep linked RS/CR documents responsible for narrative, plans, evidence, and outcomes.
- Use stable project-wide `RSNNN` and `CRNNN` identifiers; never encode a person,
  journey, database row, or local path in an ID.
- Keep Git and pull requests responsible for collaboration, conflicts, history, and
  recovery.
- Do not inspect, migrate, reconcile, or dual-write legacy SQLite Workbench state.
- Require explicit Navigator authority for semantic status, assignment, merge,
  publication, and release decisions.
- Add automation only after repeated operational pain demonstrates the need.

## Collaboration Protocol

- [Collaborative Refinement Protocol](collaboration-protocol.md) — inspect, capture,
  select, plan, assign, validate, close, and return-handoff rules for contributors and
  their Mirrors.

## Change Requests

- [CR005 — Present the canonical Workbench clearly](cr005-present-canonical-workbench-clearly.md)
- [CR006 — Record the active Driver and delivery link](cr006-record-active-driver-and-delivery-link.md)
- [CR007 — Define the collaborative capture and handoff protocol](cr007-collaborative-capture-and-handoff-protocol.md)

## Review And Closure

CR005 established a standard read-only Workbench view, CR006 made active execution
ownership and delivery visible, and CR007 defined the complete contributor and return
handoff route. All three Change Requests were validated through natural Pi prompts and
reached `done` without introducing a Markdown parser, shared database, projection,
synchronization, watcher, lock manager, or custom Git protocol.

An isolated second-Mirror smoke captured the next project-wide CR under an explicit RS,
preserved focus, left assignment empty, and avoided SQLite. Navigator validation then
confirmed that a newly loaded Mirror could explain the complete collaboration route,
including terminal handoff and ordinary Git conflict behavior, from the project
documents alone.

No RS-level corrective debt action is required. The first real contributor handoff may
reveal future refinements, but those should be captured from observed use rather than
kept as speculative closure blockers. RS002 closed on 2026-08-03 with current
Refinement focus cleared. Commit, push, pull request, merge, publication, and release
remain separate authority decisions.
