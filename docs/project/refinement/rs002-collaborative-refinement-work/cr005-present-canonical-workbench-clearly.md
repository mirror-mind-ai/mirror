[< RS002](index.md) · [Canonical status](../index.md#change-requests)

# CR005 — Present The Canonical Workbench Clearly

## Problem

Builder Home, Orientation, and Resume identify the file-first Refinement authority and
point to `docs/project/refinement/index.md`, but they do not present the Workbench
contents. A contributor must ask for an explanation and receives an unconstrained
conversational summary rather than a consistent view of focus, ordering, status, and
available movement.

## Expected Behavior

When asked to show or inspect Refinement Work, Mirror presents a consistent,
Navigator-facing view of the canonical index: current focus, active or proposed
Refinement Stories, ordered open Change Requests, terminal history, current status,
and the next safe action. The presentation must remain read-only and must identify the
canonical file it used.

The solution must not introduce a Markdown parser, projection, watcher, synchronization
mechanism, new persistence layer, or silent SQLite fallback. The Markdown documents
remain the authority; presentation is derived by the agent reading those documents.

## Impact

Without a stable presentation, a new collaborator can access the Workbench but cannot
quickly orient themselves or verify that their Mirror understood the same shared state.

## Plan Or Decision

Implement this as an agent-rendered, read-only presentation contract rather than a
runtime-generated Ariad surface.

### Presentation contract

When the Navigator asks to show, inspect, or orient to the file-first Workbench, Mirror
must read the canonical index and the linked documents needed to explain the current
focus, then render one compact `Refinement Workbench` view containing:

1. the canonical project-relative index path;
2. the focused RS and CR, or an explicit `none`;
3. all RS entries with their canonical status;
4. open CRs in canonical order with ID, RS, title, and status;
5. terminal CR history after open work;
6. the next safe action for the focused item, grounded in its current status and linked
   plan rather than inferred from SQLite or private runtime state; and
7. a read-only boundary stating that inspection selected, changed, and executed
   nothing.

The view should make the focused items visually distinguishable and remain readable
when no focus, no open work, or no terminal history exists. It must report an unreadable
or structurally ambiguous index instead of silently falling back to SQLite.

### Implementation route

1. Add the presentation contract and a stable example shape to the file-first section
   of `.pi/skills/mm-build/SKILL.md`.
2. Update `REFERENCE.md` so the public file-first contract says that inspection renders
   this standard view while files remain authoritative.
3. Do not add Python parsing, `wrap_ariad_surface`, storage, projection, synchronization,
   watcher, cache, or legacy Workbench access.
4. Keep the existing Builder Home, Orientation, and Resume behavior unchanged: those
   runtime surfaces identify the authority and index path; the detailed Workbench view
   appears only when the Navigator asks to inspect Refinement Work.
5. Validate with an isolated Pi read-only smoke against a temporary project containing
   a representative canonical index. The observed response must show focus, ordered
   open work, terminal history, next action, source path, and the no-mutation boundary,
   without consulting SQLite.

### Acceptance behavior

- Repeated inspection of the same files produces the same facts and ordering even when
  prose varies.
- Inspection does not edit files or select work.
- Canonical status and focus are never overridden by linked-document wording.
- Missing or invalid canonical content is reported, not recovered from SQLite.
- The implementation remains instruction-only; no Markdown parsing subsystem is added.

### Conscious exclusions

- Claude Code skill parity, which remains a separately tuned runtime surface.
- Driver and delivery-link display before CR006 defines their canonical representation.
- The full collaborative transition and handoff protocol owned by CR007.
- A deterministic runtime-wrapped Ariad surface.

## Evidence

During post-release dogfooding, asking whether the Workbench had content required a
manual conversational summary. Builder's existing Refinement field showed only
`authority: project files` and the canonical index path.

Implementation added the standard file-first presentation contract to
`.pi/skills/mm-build/SKILL.md` and its public behavior summary to `REFERENCE.md`. No
Python runtime or storage code changed.

An isolated Pi smoke used:

- Mirror home: `/tmp/mirror-cr005-smoke/home`
- project: `/tmp/mirror-cr005-smoke/project`
- journey: `cr005-smoke`
- output: `/tmp/mirror-cr005-smoke/pi-output.txt`

The rendered view named the canonical source, distinguished RS002/CR005 as focus,
preserved all open CR ordering and statuses, separated CR003 as terminal history,
named the next safe action and read-only boundary, and stated that SQLite was not
consulted. A recursive diff confirmed that the canonical Refinement files were
unchanged by the smoke. Documentation links, roadmap heading uniqueness, and
`git diff --check` passed.

## Review

The implementation is proportional to the observed experience gap: it changes Builder
skill guidance and public documentation only. It adds no parser, Python runtime code,
storage, synchronization, or new Git protocol. The isolated smoke and Navigator's
natural-language validation both exercised the intended user route.

No corrective debt action is required. Driver/delivery visibility and the collaborative
transition protocol remain intentionally owned by CR006 and CR007 rather than hidden
inside this presentation change. Claude Code parity remains a conscious exclusion from
this CR, not an accidental partial implementation.

## Subsequent Extension

[CR006](cr006-record-active-driver-and-delivery-link.md) extends this presentation
contract: assigned CRs show canonical Driver and Delivery details, while unassigned
rows omit them. CR006 changes no other CR005 ordering, read-only, or authority rule.

## Outcome

Done. The Navigator validated the behavior on 2026-08-03 using the natural prompt
`Mostre o Refinement Workbench` in a newly loaded Pi session. The observed view named
the canonical source, showed RS002/CR005 focus, preserved RS and CR ordering and status,
separated terminal history, recommended the validation decision as the next safe
action, preserved the read-only boundary, and stated that SQLite was not consulted.

After closure, CR005 moved to terminal history and the current CR focus was cleared.
RS002 remains active; selecting CR006 or CR007 is a separate Navigator decision.
