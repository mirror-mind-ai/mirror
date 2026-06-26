# Plan — CV20.DS6.TS1 Workbench Storage Model

## Objective

Introduce durable Builder Workbench storage for Ariad Refinement Work so Mirror can persist Refinement Stories (RS), Change Requests (CR), their ordering, provenance, timestamps, and active refinement cursor state outside roadmap files.

This story is substrate only. It should make later DS6 stories possible without implementing the Navigator-facing compose/pull/CR-cycle flow yet.

## Current State

- Builder Delivery state uses runtime sessions through `src/memory/builder/delivery_cursor.py`.
- Existing durable project/runtime tables are introduced through `src/memory/db/migrations.py` and storage mixins under `src/memory/storage/`.
- Builder Home currently renders Refinement as a read-only placeholder through `src/memory/builder/home_surface.py`:
  - active RS: none
  - workbench storage: not implemented yet
  - seed CRs from the DS6 plan markdown
- DS6 seed CRs are provisional markdown records and should remain a migration source for later composition work, not be silently imported in this story.

## Persistence Strategy

Use dedicated SQLite tables owned by the Mirror memory database and exposed through the existing `Store` facade. Do not store Workbench state in Builder runtime-session metadata except for backwards-compatible Delivery cursor state that already exists.

Rationale:

- RS and CR records are project work items, not ephemeral session metadata.
- The Workbench needs queryable status, ordering, journey scoping, provenance, and active-state joins.
- Later DS6 slices will need filtered views such as open CRs, CRs for one RS, active RS, parked CRs, promoted CRs, and recently updated Workbench entries.
- Dedicated tables make migrations, tests, and future CLI/API behavior explicit.

### Proposed Tables

1. `builder_refinement_stories`
   - `id` text primary key
   - `journey` text not null
   - `title` text not null
   - `description` text
   - `status` text not null
   - `position` integer not null default 0
   - `source` text not null default `manual`
   - `provenance` text
   - `created_at` text not null
   - `updated_at` text not null
   - `pulled_at` text
   - `closed_at` text
   - status check: `draft`, `open`, `active`, `closed`, `parked`

2. `builder_change_requests`
   - `id` text primary key
   - `journey` text not null
   - `refinement_story_id` text nullable references `builder_refinement_stories(id)`
   - `title` text not null
   - `body` text not null
   - `status` text not null
   - `position` integer not null default 0
   - `source` text not null default `manual`
   - `provenance` text
   - `outcome_notes` text
   - `created_at` text not null
   - `updated_at` text not null
   - `completed_at` text
   - status check: `captured`, `planned`, `active`, `implemented`, `validated`, `done`, `parked`, `rejected`, `promoted`

3. `builder_refinement_cursors`
   - `journey` text primary key
   - `active_refinement_story_id` text nullable references `builder_refinement_stories(id)`
   - `active_change_request_id` text nullable references `builder_change_requests(id)`
   - `last_refinement_event` text nullable
   - `updated_at` text not null

Indexes:

- RS by `(journey, status, position, updated_at)`
- CR by `(journey, refinement_story_id, status, position, updated_at)`
- CR by `(journey, status, updated_at)` for unassigned/captured workbench views

### Migration Approach

- Add one idempotent migration, likely `015_create_builder_workbench`, to `src/memory/db/migrations.py`.
- Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
- Keep CHECK constraints intentionally small and aligned with DS6 vocabulary.
- Do not backfill seed CRs from markdown in this story.
- Ensure fresh-schema and migrated-schema paths both receive the same tables.

## Storage/API Strategy

Storage should be layered, with persistence separated from Builder-domain semantics:

```text
SQLite tables
  → memory.storage.builder_workbench.BuilderWorkbenchStore
  → memory.storage.store.Store facade
  → memory.builder.workbench domain helpers/snapshot
  → Builder Home / later CLI commands
```

`memory.storage.builder_workbench` should be a low-level persistence mixin: validate required fields, perform inserts/updates/queries, and return typed records. It should not enforce the full Ariad Refinement lifecycle.

`memory.builder.workbench` should be the Builder-domain layer: normalize statuses, provide a small intent-oriented API, and build the compact Workbench snapshot used by Builder Home.

### Initial Typed Records

- `RefinementStoryRecord`
- `ChangeRequestRecord`
- `RefinementCursorRecord`
- `WorkbenchSnapshot`

### Low-Level Store Methods

Names can be adjusted during implementation, but the API should preserve this shape:

```python
create_refinement_story(
    *, journey: str, title: str, description: str | None = None,
    status: str = "draft", source: str = "manual",
    provenance: str | None = None, position: int | None = None,
) -> RefinementStoryRecord

get_refinement_story(story_id: str) -> RefinementStoryRecord | None
list_refinement_stories(journey: str, *, status: str | None = None) -> tuple[RefinementStoryRecord, ...]

create_change_request(
    *, journey: str, title: str, body: str,
    refinement_story_id: str | None = None,
    status: str = "captured", source: str = "manual",
    provenance: str | None = None, position: int | None = None,
) -> ChangeRequestRecord

get_change_request(change_request_id: str) -> ChangeRequestRecord | None
list_change_requests(
    journey: str,
    *, refinement_story_id: str | None = None,
    status: str | None = None,
    include_unassigned: bool = True,
) -> tuple[ChangeRequestRecord, ...]

set_refinement_cursor(
    *, journey: str,
    active_refinement_story_id: str | None = None,
    active_change_request_id: str | None = None,
    last_refinement_event: str | None = None,
) -> RefinementCursorRecord

get_refinement_cursor(journey: str) -> RefinementCursorRecord | None
clear_refinement_cursor(journey: str) -> None
```

### Builder-Domain Helpers

```python
create_refinement_story(store: Store, ...) -> RefinementStoryRecord
capture_change_request(store: Store, ...) -> ChangeRequestRecord
attach_change_request_to_story(store: Store, ...) -> ChangeRequestRecord
get_workbench_snapshot(store: Store, journey: str) -> WorkbenchSnapshot
```

### API Boundaries

- Storage API may create, list, associate, and update cursor state.
- Storage API may validate foreign-key existence when associating a CR to an RS.
- Storage API may choose default positions by appending after the current max position for the relevant journey/RS scope.
- Storage API must not pull an RS, start a CR cycle, mark lifecycle checkpoints, or mutate roadmap Delivery state.
- Builder-domain API may compute snapshots for rendering but must not trigger lifecycle transitions during Builder Home.

## Implementation Scope

- Add idempotent DB migration for the Workbench tables and indexes.
- Add typed record objects for RS, CR, refinement cursor state, and Workbench snapshot.
- Add `src/memory/storage/builder_workbench.py` and wire it into `Store`.
- Add `src/memory/builder/workbench.py` as the Builder-domain API.
- Update Builder Home refinement inspection to report storage as implemented when the tables/API are available and to show stored counts/active RS when present.
- Preserve seed CR markdown counting as provisional source visibility until a later migration/import story exists.

## Non-Goals

- Do not implement sibling roadmap item: Builder Documentation And Migration.
- Do not implement sibling roadmap item: Refinement Flow Runtime.
- Do not implement sibling roadmap item: Compose A Refinement Story.
- Do not implement sibling roadmap item: Pull A Refinement Story.
- Do not implement sibling roadmap item: Traverse Change Request Cycles.
- Do not implement sibling roadmap item: Close A Refinement Story.
- Do not implement sibling roadmap item: Refinement Workbench And Flow.
- Do not implement sibling roadmap item: Define Delivery Story Release Intent.
- Do not implement sibling roadmap item: Release And Push Policies.
- Do not implement sibling roadmap item: Debt Ledger And Refactor Loop.
- Do not implement sibling roadmap item: Method Preferences And Overrides.

## Acceptance Criteria

- Fresh and migrated databases contain Workbench tables after migrations run.
- The migration is idempotent.
- A Refinement Story can be created and listed by journey with stable id, status, timestamps, source/provenance, and ordering.
- Change Requests can be created, listed by journey, and associated to a Refinement Story with stable ordering.
- Active refinement cursor state can be set, read, and cleared per journey without disturbing Delivery cursor state.
- Builder Home can observe storage availability and render Workbench storage as implemented when running against the new schema.
- Existing Delivery lifecycle tests continue to pass.

## Validation Plan

Automated checks:

```bash
uv run pytest tests/unit/memory/db/test_migrations.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/db src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/db tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/db src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/db tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/db src/memory/storage src/memory/builder src/memory/cli/build.py
git diff --check
```

Manual/Navigator validation:

```bash
uv run python -m memory build load sandbox-pet-store
```

Expected observation: Builder Home remains stable and Refinement field reports durable Workbench storage as implemented/available with empty Workbench counts, no active RS, and no lifecycle execution.

## Risks

- Over-modeling the lifecycle too early. Mitigation: store only state needed for DS6 and keep lifecycle commands out of TS1.
- Split-brain between Delivery cursor and Refinement cursor. Mitigation: use a separate cursor table and explicit API names.
- Seed CR migration ambiguity. Mitigation: keep seed CRs visible but do not auto-import them in TS1.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
