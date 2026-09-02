[< Story](index.md)

# Review — CV15.DS3 Recursive Journey Hierarchy

## Scope Review

The implementation stays inside the confirmed boundary:

- `parent_journey` remains metadata; no migration or schema divergence;
- arbitrary depth changes organization and rendering only;
- exact journey ids still scope conversations, memories, tasks, attachments,
  routing, Builder state, and Scene movement counts;
- moving a journey mutates only its own parent metadata;
- filesystem paths remain independent;
- removal is conservative and has no public UI.

No inheritance, cascade, automatic reparenting, path inference, watcher, or
filesystem operation was introduced.

## Design Review

### Parent validation

The previous one-level guards were replaced by an ancestor walk. It rejects the
proposed journey appearing anywhere above the parent and also rejects extending a
pre-existing malformed cycle. Parent validation remains shared by create and
metadata-update paths.

### Recursive reads

Service, Scene, CLI, and web projections track visited ids. Valid trees render at
arbitrary depth; malformed rootless cycles remain bounded and visible rather than
hanging a read surface. Unknown-parent rows preserve the existing root fallback.

### Stable movement

A regression test proves that changing `parent_journey` preserves the identity
row id and `project_path`. The isolated smoke additionally verified a moved
subtree without filesystem mutation.

### Conservative removal

Review identified a possible check-then-delete race in the initial service
implementation. The final design moves association checking and identity deletion
into one storage transaction using `BEGIN IMMEDIATE`. It rechecks child journeys
and all known journey-owned records while holding the write lock. Parents and
associated leaves are refused; only empty leaves are deleted.

### Text rendering

Navigator homologation exposed Markdown interpreting third-level indentation as
a code block. Nested CLI lines now begin with visible `│` connectors at column
zero, and a regression test rejects four-space-prefixed hierarchy output.

## Refactoring Assessment

No blocking refactor remains.

The Python service/Scene projections and JavaScript renderer each maintain their
own bounded traversal because they produce different read models across the
service/web boundary. Consolidating them into one implementation would either
leak surface concerns into the domain service or require a broader typed tree DTO.
That is not justified by current evidence. CV22 parity work must reproduce the
observable contract through goldens rather than import Python internals.

The web recursive helpers remain manually validated because the repository has no
isolated JavaScript component-test harness for `app.js`. Backend tree semantics,
HTTP payloads, syntax, browser behavior, and Navigator homologation are covered;
introducing a frontend harness solely for this story would be disproportionate.
Revisit if another recursive web defect appears.

## Review Outcome

- Blocking defects: none.
- In-cycle refactors completed: atomic removal transaction; Markdown-safe CLI
  connectors; stable-move regression coverage.
- Deferred product scope: public removal UI/API.
- TypeScript parity: explicitly assigned to CV22.E2.S5 reads and CV22.E4 writes.
