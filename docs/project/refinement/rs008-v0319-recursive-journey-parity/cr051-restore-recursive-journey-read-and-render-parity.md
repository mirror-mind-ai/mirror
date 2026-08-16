[< RS008](index.md) · [Canonical status](../index.md#change-requests)

# CR051 — Restore Recursive Journey Read And CLI Rendering Parity

## Problem

The TS journey option sorter and CLI renderer still implement roots followed by
immediate children. Deep descendants are omitted, option DTOs lack `depth` and complete
`lineage`, malformed rootless cycles are not deliberately retained as bounded visible
items, and child output still uses leading-space indentation that can become a Markdown
code block.

The `journeys` command is already routed to TS on the migration branch, so this is an
observable parity defect rather than dormant future scope.

## Expected Behavior

Given the same journey rows as the `v0.31.9` Python oracle, TypeScript returns every
journey exactly once in deterministic depth-first order, including arbitrary-depth
descendants, unknown-parent roots, and bounded malformed cyclic metadata. Every option
includes numeric `depth` and complete root-to-item `lineage`.

The CLI renders all depths using column-zero `│` connectors, preserves status/name
ordering and existing stage/description behavior, and never emits hierarchy lines that
begin with four spaces.

## Impact

Today a deep tree can lose grandchildren and deeper nodes when read through the TS
front door even though those journeys remain in the database. Users receive an
incomplete organizational map from a command already considered ported.

## Plan Or Decision

Navigator-approved plan. Deliver the released `v0.31.9` read contract in seven
bounded slices:

1. **Lock the delta with failing tests.** Extend the journey-option tests with a
   four-level tree, an unknown parent, and a rootless malformed cycle. Assert exact
   depth-first order, numeric `depth`, complete root-to-item `lineage`, deterministic
   sibling ordering, and one appearance per journey. Add renderer tests that fail while
   grandchildren are omitted or any hierarchy line begins with four spaces.
2. **Advance only the Python compatibility oracle required by this port.** Bring the
   branch copy of `JourneyService.list_journey_options` and
   `_sort_journey_options` to the released `v0.31.9` bounded depth-first behavior so
   the existing Python-generated golden remains a real oracle rather than a hand-coded
   TS expectation. Add the corresponding focused Python read tests. Do not absorb
   parent mutation, cycle validation, removal, Workspace, or web behavior from
   `v0.31.9`; those remain CR052–CR054. Review and deliberately refresh the
   `journey.py` oracle-baseline hash only after TS parity is green.
3. **Port the recursive pure decision core.** Add `depth` and `lineage` to
   `JourneyOption`. Build the parent-to-children index once, visit sorted roots
   depth-first with a visited set, then visit any remaining sorted items as bounded
   synthetic roots so rootless legacy cycles stay visible without looping. Preserve
   CR050 metadata-only parent authority and the existing stable
   `(status != active, lowercased name)` ordering.
4. **Render the ordered projection directly.** Stop rebuilding a two-level hierarchy
   inside `renderJourneys`; iterate the already ordered rows and render from each row's
   `depth`. Use the Python `v0.31.9` column-zero connector contract
   (`"│  " * depth + "└─ "`) and the matching detail indentation while preserving
   icons, stage, description, empty state, and both `journeys` routes.
5. **Strengthen deterministic fixtures.** Expand the Python journey golden corpus with
   deep descendants, an orphan, and a malformed cycle, then regenerate the committed
   DTO/order golden. Expand the front-door render fixture and render goldens to prove
   multiple depths and Markdown-safe output. Golden regeneration must remain a no-op
   in CI after commit.
6. **Strengthen copied-database parity without exposing user data.** Extend the
   real-DB-copy journey probe from ordered IDs alone to redacted structural signatures
   covering ID, depth, and lineage. Continue hashing reports by default and never
   mutate or commit a live database.
7. **Reconcile narrative and validate end to end.** Amend the completed DS2.US3 and
   DS7.US1 journey-read narratives to record the `v0.31.9` contract advance. Run
   focused Python/TS tests first, then full Python and TS suites, typecheck, Biome,
   Ruff, golden determinism, oracle-drift, structural/migration parity, portable
   real-DB-copy parity, docs checks, and an isolated front-door smoke with at least
   four levels plus malformed legacy state.

### Acceptance checkpoint

CR051 is ready for Navigator validation when:

- every input journey is returned exactly once in deterministic depth-first order;
- every option carries correct `depth` and complete `lineage`;
- unknown parents and rootless cycles remain bounded and visible;
- CLI output shows every level with column-zero `│` connectors and no hierarchy line
  beginning with four spaces;
- stage, description, status icons, empty-state behavior, metadata-only parent
  authority, and database safety remain unchanged; and
- CR052–CR054 behavior has not been implemented implicitly.

### Conscious exclusions

No schema migration, parent write, movement validation, cycle repair, journey removal,
Workspace/web change, inherited context, path inference, filesystem mutation, or
production-database reconciliation belongs to CR051.

## Evidence

A read-only probe against the pre-refresh implementation returned only `root` and
`area` for `root → area → business → product`. After refreshing to remote commit
`ea54d4c`, `ts/src/journey/journeyOptions.ts` and
`ts/src/frontDoor/render/journeys.ts` still use roots-then-immediate-children logic and
expose no `depth` or `lineage`.

## Outcome

Planned. The Navigator approved the seven-slice implementation and acceptance
checkpoint. No Driver or Delivery is assigned, and implementation remains a separate
explicit authorization gate.
