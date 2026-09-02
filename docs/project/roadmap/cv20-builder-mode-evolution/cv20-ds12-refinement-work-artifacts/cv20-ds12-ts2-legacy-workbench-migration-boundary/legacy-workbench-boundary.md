# Legacy Workbench Boundary

## Decision

For a project containing `docs/project/refinement/index.md`, project files are the sole
canonical shared authority for Refinement Story and Change Request identity, backlog
order, current focus, status, narrative, and evidence.

The SQLite Workbench shipped by [CV20.DS6](../../cv20-ds6-refinement-workbench-flow/index.md)
is preserved as compatibility-only local state. It is not reconciled with project files
and does not override the [canonical Refinement index](../../../../refinement/index.md).

This is an authority decision, not a data migration.

## Shipped Legacy Surface

### Schema

Python migrations preserve three tables:

| Migration | Tables / effect |
|-----------|-----------------|
| `015_create_builder_workbench` | `builder_refinement_stories`, `builder_change_requests`, `builder_refinement_cursors` |
| `016_builder_workbench_display_codes` | Backfills and indexes journey-local `RSNNN` / `CRNNN` display codes |

The records use UUID primary keys and journey-scoped fields. Stories and requests carry
status, ordering, provenance, timestamps, and compressed outcome notes. Cursors hold one
active RS/CR per journey.

### Runtime

The Python Builder currently supports SQLite-backed:

- RS create, overview, pull, review, coherence, close, and park;
- CR capture, attach, discard, select, confirm, plan, implement, validate, done, park,
  reject, and promote;
- Builder Home counts, active RS/CR, and next-move guidance.

The storage layer commits those mutations directly. `REFERENCE.md` and the `mm-build`
skill still describe and route that legacy command surface.

### TypeScript seam

The CV22 TypeScript core's `ts/src/db/schemaState.ts` includes migrations `015` and `016`
in `KNOWN_MIGRATION_IDS`. Its exact migration-set guard treats missing known migrations
or unknown newer migrations as an incompatibility. Rewriting migration history would
therefore affect existing databases and the TypeScript transition simultaneously.

## Why Automatic Mapping Is Unsafe

| File-first authority | Legacy SQLite |
|----------------------|---------------|
| Project repository scope | Journey scope |
| Project-stable `RSNNN` / `CRNNN` identity | UUID identity plus journey-local display code |
| RS: `proposed`, `active`, `parked`, `closed` | RS: `draft`, `open`, `active`, `parked`, `closed` |
| CR includes `in_progress` and `blocked` | CR includes `active` and `implemented` |
| Evolving Markdown narrative and linked evidence | Structured columns plus latest outcome notes |
| Git history | Local database history |

A journey can point at different paths over time, several journeys can refer to related
work, and a row contains no stable repository identity. Automatic assignment would be a
guess. Status conversion can also lose meaning, while narrative reconstruction can
publish local provenance or private context.

Therefore no deterministic, lossless, privacy-safe automatic migration exists under the
current contracts.

## Transition Rules

1. **Files win shared authority.** When the canonical index exists, collaborators and
   agents use it for project Refinement state.
2. **Legacy data stays local.** Existing rows are neither imported nor published.
3. **No implicit movement.** Import, export, reconciliation, deletion, and project
   assignment require separate explicit operations; none exists today.
4. **Migration history remains additive.** Migrations `015` and `016` are not removed or
   rewritten while supported databases or the TypeScript guard depend on them.
5. **Commands remain unchanged for now.** This decision does not alter legacy runtime
   behavior. A later routing story must prevent file-enabled projects from accidentally
   treating SQLite as canonical while preserving compatibility elsewhere.
6. **No dual writes.** Future routing must not update files and SQLite as peer stores.
   One authority plus an optional explicit export is safer than synchronization.
7. **No removal by deadline.** Deprecation and physical removal depend on observed use
   and coordinated Python/TypeScript planning, not calendar pressure.

## Future Triggers

### File-first routing

Allowed as the next bounded story because a real project index now exists and has been
dogfooded. It may change guidance or routing, but must not migrate rows.

### Explicit export

Consider only when a user asks to recover legacy records that are not already represented
in project files. Any design must include an explicit source journey, destination
project, preview, identity conflict handling, privacy review, and Navigator confirmation.

### Deprecation

Consider only after file-first routing has shipped and legacy command use can be observed
without inspecting personal row contents. Deprecation must preserve read/recovery access
for existing data.

### Physical removal

Consider only in a separately versioned schema change coordinated with the TypeScript
migration guard, after supported databases no longer require the tables. Removal must
never be a side effect of opening a project with a Refinement index.

## Prohibited Interpretations

This decision does not authorize:

- reading or counting production Workbench rows;
- assigning journey rows to this or any other repository;
- treating matching `RSNNN` / `CRNNN` labels as identity equality;
- silently freezing or disabling legacy commands;
- exporting, deleting, dropping tables, or rewriting migrations;
- changing TypeScript schema compatibility;
- claiming that a future migration has been approved.

## Next Bounded Change

Route Builder guidance to `docs/project/refinement/index.md` when that file exists while
leaving legacy behavior available for projects without it. That change requires its own
Plan, validation, and compatibility boundary.
