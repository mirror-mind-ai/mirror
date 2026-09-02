[< Story](index.md)

# Plan — CV15.DS3 Recursive Journey Hierarchy

## Boundary

This story removes the artificial two-level limit from the existing
`parent_journey` relationship. It does not introduce a new hierarchy model or a
schema migration. The relation remains journey identity metadata and remains
strictly organizational.

The Python product may evolve while the TypeScript strangler is underway. This
story therefore treats TS parity as an explicit downstream obligation rather
than a prerequisite that freezes user-facing development.

## Current State

The existing implementation already stores `parent_journey` in journey metadata
and keeps operational content scoped to exact journey ids. The depth limit is
implemented in behavior and presentation:

- `JourneyService._validate_parent_journey()` rejects parents that have parents
  and rejects assigning a parent to a journey that has children.
- `JourneyService._sort_journey_options()` orders roots and one child level.
- `memory.cli.journeys` prints roots and one child level.
- `WorkspaceSurface._scene_model()` attaches one child level.
- `WorkspaceSurface._scene_location_path()` resolves at most one parent.
- the web renderer flattens only depth 0 and 1 in navigation, Scene, All
  Journeys, and parent-selection labels.
- there is no public journey-removal operation today; generic identity deletion
  exists only in storage.

No schema change is required because metadata can already represent arbitrary
parent chains.

## Design

### 1. One canonical tree projection

Add a small deterministic hierarchy projection in the journey service. From the
flat journey option set, it should derive:

- children grouped by parent;
- stable root ordering;
- recursive depth-first ordering with `depth` and lineage metadata;
- root-to-node lineage;
- descendants or ancestor ids needed by validation.

The projection must be iterative where practical, or otherwise cycle-guarded,
so corrupt legacy metadata cannot recurse forever. Unknown-parent rows remain
visible as roots, preserving current defensive behavior. A detected pre-existing
cycle fails loudly on mutation and degrades safely on read rather than hanging.

All children at every depth use the existing ordering rule: active first, then
case-insensitive title.

### 2. Parent validation

Replace the one-level checks with full-chain validation:

1. empty parent removes the organizational relation;
2. parent must exist;
3. parent cannot equal the journey;
4. walking from the proposed parent toward the root must never reach the journey;
5. a pre-existing malformed cycle encountered during the walk is rejected with
   a clear error.

Creating or moving a journey changes only its own `parent_journey` metadata.
The operation must not mutate ids, project paths, ancestors, descendants, or
filesystem content.

### 3. Read models and textual rendering

`list_journey_options()` returns recursive depth-first order and adds enough
metadata for consumers to render depth without re-deriving the tree. Existing
keys remain stable.

`python -m memory journeys` recursively renders every node. Indentation and tree
connectors communicate depth while status, stage, and description remain
unchanged.

Focused Scene computes the complete lineage from root to selected journey.
Nearby journeys remain siblings sharing the same immediate parent. The Scene
journey map nests every descendant recursively and retains movement counts on
each exact journey only.

### 4. Web rendering

Update the existing JavaScript hierarchy helper to recurse and return the actual
depth for every visible node. Expansion is per node and automatically opens the
selected node's ancestor chain.

Use the same recursive hierarchy representation for:

- Workspace menu;
- Current Scene journey map;
- All Journeys nested summaries;
- parent and conversation-assignment selects.

Labels in selects include enough ancestral context to disambiguate duplicate
journey names. CSS depth should be expressed through a bounded visual mechanism
rather than one class per level.

### 5. Journey removal contract

Introduce removal through the journey service rather than exposing generic
identity deletion. The operation:

- refuses when direct children exist;
- does not reparent children;
- does not cascade into memories, conversations, tasks, attachments, journey
  paths, Builder state, Explorer stories, or filesystem content;
- requires a separately reviewed user-facing route before any UI control is
  enabled.

During implementation inspection, enumerate dependent records and decide whether
safe removal means deleting only the journey identity or refusing while any
journey-owned records remain. Do not guess this irreversible boundary. The
children guard is settled; treatment of other records remains a Navigator
checkpoint before wiring removal publicly.

### 6. TypeScript moving-target contract

Update the CV22 decision and roadmap so Python evolution is not described as
frozen. The migration contract becomes:

- Python remains the current product authority until a command is strangled;
- new Python behavior records an explicit TS parity obligation;
- schema changes remain exceptional cross-core events;
- goldens capture observable behavior at the point a command enters TS work;
- TS parity scope includes recursive journey ordering, depth/lineage, and cycle
  semantics before the journey command is claimed as ported.

CV22.E2.S5 is the natural owner for read parity. Journey writes and removal
belong to CV22.E4.

## TDD Slices

1. **Hierarchy semantics:** replace depth-limit tests with arbitrary-depth,
   indirect-cycle, move-stability, malformed-cycle, and recursive-order tests.
2. **Text surface:** add a three-plus-level CLI fixture and implement recursive
   connectors.
3. **Workspace read model:** test recursive Scene map, full lineage, and exact
   sibling semantics before changing composition.
4. **Web contract:** add renderer/source contract tests for recursive navigation,
   nested Scene/All Journeys, ancestor expansion, and lineage labels; then update
   JavaScript/CSS.
5. **Removal guard:** add service tests for refusal with children and no-cascade
   behavior only after the outstanding dependent-record boundary is confirmed.
6. **Migration documentation:** amend the CV22 decision and roadmap with explicit
   parity debt for this capability.
7. **Documentation and manual validation:** update architecture/reference and run
   isolated CLI/browser validation against a temporary database.

## Risks

### Cycles in existing metadata

Existing generic storage paths can contain malformed metadata. Every recursive
read must track visited ids. Mutation fails loudly; display must remain bounded
and visibly preserve nodes rather than hang.

### Semantic inheritance by presentation

A deep tree can visually imply inherited context. Keep movement counts and
content queries exact by journey id, and state the organizational-only rule in
product docs and validation.

### Deep UI indentation

Unbounded left padding eventually destroys usable width. Use modest bounded
indentation, connectors, and lineage labels rather than literal full-depth
padding everywhere.

### Moving migration target

Allowing Python evolution creates additional TS parity work. The mitigation is
not dual implementation; it is explicit capability-level parity tracking and
goldens before each command is strangled.

### Irreversible removal ambiguity

The product has no public journey deletion today. Do not invent cascade or
orphan semantics while implementing the hierarchy. Stop at the removal design
checkpoint if dependent-record treatment is not explicitly decided.

## Documentation Impact

- CV15 index and root roadmap: add DS3 as active/planned product evolution.
- Decisions and CV22 docs: supersede the strict Python freeze with the moving
  target contract.
- Architecture and reference: document recursive organizational hierarchy and
  exact-context behavior.
- Release notes/versioning only after implementation and validation define a
  release boundary.
