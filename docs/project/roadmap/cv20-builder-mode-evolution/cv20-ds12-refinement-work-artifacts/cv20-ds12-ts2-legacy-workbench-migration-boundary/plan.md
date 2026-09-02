# Plan — CV20.DS12.TS2 Define Legacy Workbench Migration Boundary

## Objective

Settle authority and compatibility before the document-first Workbench is integrated
with Builder. This story decides; it does not migrate or alter runtime behavior.

## Verified Current State

### SQLite schema and identity

Migrations `015_create_builder_workbench` and
`016_builder_workbench_display_codes` create and retain:

- `builder_refinement_stories`;
- `builder_change_requests`;
- `builder_refinement_cursors`;
- journey-scoped UUID identities and `RSNNN`/`CRNNN` display codes.

Rows carry journey identity, status, ordering, provenance, timestamps, and outcome notes,
but no stable project repository identity or canonical artifact path.

### Runtime behavior

Python storage and domain helpers commit mutations for composition, pull, CR lifecycle,
terminal verbs, RS review/coherence/close, and cursor updates. Builder Home derives
active Refinement state and counts from SQLite. `REFERENCE.md` and `mm-build` currently
route natural-language Refinement requests to those commands.

### TypeScript compatibility

The CV22 TypeScript schema guard includes migrations `015` and `016` in its exact known
migration set. Removing or rewriting their history would make existing databases and the
TS front door disagree.

### Contract mismatch

The file-first model intentionally differs from legacy storage:

- files use project identity; legacy rows use journey identity;
- file IDs are canonical project IDs; DB codes are journey-local display values;
- RS/CR status vocabularies are not identical;
- files preserve narrative and evidence; DB rows compress them into fields and latest
  notes.

There is therefore no deterministic, lossless automatic mapping.

## Options

### A — Keep both as equal authorities

Rejected. This creates permanent status, focus, identity, and ordering conflicts.

### B — Automatically import or reconcile SQLite into files

Rejected. Journey-scoped rows cannot be safely assigned to a project, ID/status mapping
is ambiguous, and implicit migration risks publishing private/local context.

### C — Delete legacy tables and commands now

Rejected. It destroys local history, breaks compatibility expectations, and conflicts
with the TypeScript migration guard.

### D — Files canonical; SQLite compatibility-only and preserved

Recommended. Existing rows, migrations, and commands remain untouched during a bounded
transition. Projects containing `docs/project/refinement/index.md` treat that file as
the sole shared authority. Legacy SQLite is local historical/runtime compatibility, not
a source to merge automatically.

## Decision To Materialize

Record Option D with these consequences:

1. Never infer project artifacts from journey rows.
2. Never import, export, reconcile, delete, or rewrite legacy data implicitly.
3. Preserve migrations `015`/`016` and TypeScript recognition while supported databases
   may contain those tables.
4. Do not present SQLite status as canonical for a project with a Refinement index.
5. Existing legacy commands remain behaviorally unchanged until a separate compatibility
   story changes routing.
6. Any export is explicit, previewed, destination-bound, and Navigator-confirmed; it is
   justified only by a real request to recover legacy records.
7. Deprecation begins only after file-first routing is shipped and observed; physical
   removal requires separate schema/version planning across Python and TypeScript.

## Deliverables

- `legacy-workbench-boundary.md` beside this plan with the inventory, decision,
  consequences, and future triggers.
- A concise stable entry in `docs/project/decisions.md` linking to that boundary.
- A recommendation for the next DS12 story: route Builder guidance to canonical files
  when the index exists, while leaving legacy behavior available elsewhere.

## Non-Goals

- No source, migration, database, skill, REFERENCE, or TypeScript branch edits.
- No production-row inspection, count, backup, export, or deletion.
- No automated migration design beyond the prohibitions and trigger above.
- No promise to remove legacy schema on a date.
- No resolution of CR001, CR002, or CR004.

## Acceptance Behavior

```text
Given only the decision and boundary documents
When a maintainer asks how file and SQLite Workbenches coexist
Then files unambiguously win shared project authority
And SQLite preservation and non-migration rules are explicit
And TypeScript compatibility consequences are visible
And the next behavior change is a separate story
```

## Validation Route

Run:

```bash
python scripts/check_doc_links.py
git diff --check
```

Inspect changed paths and confirm only TS2/decision documentation changed. Review the
boundary against the cited migration, storage, Builder Home, skill/reference, and TS
schema evidence.

E2E decision: not required. This story records an architectural boundary and changes no
observable runtime behavior.

## Implementation Contract

- Write only the two decision artifacts and TS2 lifecycle documentation.
- Quote structures and behavior, not personal row contents.
- Keep future implementation choices reversible and separately approved.
- Commit story-scoped documentation with a descriptive English message.
- Do not push, publish, merge, tag, or release.

## Stop Conditions

- The decision requires inspecting personal Workbench rows.
- A proposed rule silently migrates or deletes data.
- Existing commands would change inside this story.
- Migration history or TypeScript schema compatibility would change.
- The document claims a future export/removal is already authorized.

## Approval Gate

Implementation begins only after Navigator approval of Option D and this boundary.
