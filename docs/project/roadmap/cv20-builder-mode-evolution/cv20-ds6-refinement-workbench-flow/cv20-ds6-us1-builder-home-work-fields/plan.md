# Plan — CV20.DS6.US1

## Objective

Turn Builder activation for Ariad-adopted journeys with no active item into a
situated Builder Home surface that shows both current Delivery field and the
initial Refinement field, without implementing durable Workbench storage or the
Refinement Story flow.

This is the first DS6 slice. It creates orientation only. It must not pull work,
create RS/CR records, execute lifecycle steps, or mutate project state during
activation.

## Scope

- Rename the activation concept in the runtime from a Delivery-only entry surface
  toward Builder Home where appropriate.
- Add a `Builder Home` or equivalent surface composition layer that renders:
  - Delivery field from existing roadmap snapshot and pull candidates;
  - Refinement field as an initial read-only placeholder;
  - available moves grounded in current state.
- Keep the Refinement field honest before TS1 storage exists:
  - active RS: none;
  - Workbench storage: not implemented yet;
  - captured provisional CRs: link to DS6 plan Seed Change Requests when present;
  - next refinement move: implement Workbench Storage Model before durable RS/CR work.
- Ensure marked Ariad surfaces returned by Builder commands remain product output:
  `/mm-build` guidance should require visible rendering before commentary, and the
  runtime should expose marked surfaces consistently enough for future helper
  hardening.
- Preserve existing Roadmap Snapshot and Pull Candidates behavior, including the
  recent fix that focuses CV20 and the recommended current item.

## Non-Goals

- Do not implement Workbench storage, RS records, or CR records.
- Do not implement RS creation, CR capture, RS pull, CR cycles, RS review,
  coherence, or close.
- Do not implement automatic CR clustering or Signal Field.
- Do not implement web UI for Workbench.
- Do not implement release/push governance, debt ledger storage, or method
  preference overrides.
- Do not change existing Builder behavior for non-Ariad journeys.
- Do not execute Pull, Plan approval, Implement, Validation, Review, Coherence,
  Done, commit, push, or release from activation.

## Acceptance Behavior

```text
Given a journey has adopted Ariad
And its delivery cursor has no active item or pending confirmation
When Builder Mode is activated for that journey
Then Builder renders a Builder Home orientation surface
And the surface includes a Delivery field with current roadmap focus and recommended pull
And the surface includes a Refinement field that honestly states Workbench storage is not implemented yet
And the surface points to provisional Seed Change Requests when they exist
And no lifecycle work is pulled or executed automatically
```

```text
Given a journey has adopted Ariad
And it already has an active delivery item or pending confirmation
When Builder Mode is activated for that journey
Then Builder continues to render the existing resume surface
And does not replace active lifecycle recovery with Builder Home orientation
```

```text
Given a Builder command returns marked Ariad surfaces
When the `/mm-build` skill handles the command output
Then the skill contract requires rendering those surfaces visibly before commentary
And future runtime helper work has an explicit implementation note
```

## Implementation Route

1. Inspect the current Builder entry path in `src/memory/cli/build.py` and the
   existing roadmap rendering in `src/memory/builder/pull_candidates.py`.
2. Add a small Builder Home surface module or extend the existing entry rendering
   path so the no-active-item case produces one orientation composed from:
   - roadmap snapshot;
   - pull candidates;
   - a read-only refinement field placeholder.
3. Keep the existing marked Ariad surface protocol. If a new surface id is added,
   route it through the same `wrap_ariad_surface` mechanism.
4. Update `.pi/skills/mm-build/SKILL.md` to explicitly require rendering marked
   Ariad surfaces before commentary.
5. Add or update focused unit tests for:
   - Builder load no-active-item output includes Builder Home / Refinement field;
   - active-item resume remains unchanged;
   - roadmap snapshot still focuses CV20/recommended pull;
   - `/mm-build` skill contract contains required-surface rendering guidance.
6. Update this story's test guide with the final validation commands and manual
   route.

## Validation Route

Automated:

```bash
uv run pytest tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

Manual Navigator route:

```bash
uv run python -m memory build load builder-mode-evolution
```

Expected observation:

- output includes Builder Mode transition;
- output or required Ariad surface orients around Builder Home / work fields;
- Delivery field shows CV20 / CV20.DS6.US1 rather than CV10;
- Refinement field is visible and honest that durable Workbench storage is not
  implemented yet;
- boundary says no item was pulled and no lifecycle work was executed unless a
  lifecycle item is already active.

Pass condition: Navigator can see the current Delivery field and the nascent
Refinement field from activation without using a separate command and without
mistaking orientation for execution.

Fail condition: activation still appears Delivery-only, hides Refinement, shows
irrelevant roadmap focus, omits required marked surfaces, or implies that
Workbench/RS/CR behavior already exists.

## Documentation Impact

- Update `.pi/skills/mm-build/SKILL.md` for Ariad surface rendering behavior.
- Update this story's `test-guide.md` after implementation details settle.
- Update `docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds6-refinement-workbench-flow/plan.md`
  if implementation changes the DS6 sequencing assumptions.

## Risks

- Builder Home may become too broad if US1 tries to implement Workbench rather
  than only render its placeholder field.
- Surface naming may conflict with existing Ariad method routes if we add a new
  marked id without updating method definitions.
- The placeholder Refinement field may overpromise unless it clearly says durable
  Workbench storage belongs to TS1.

## Stop Conditions

- The change requires durable RS/CR persistence.
- The change starts implementing RS pull or CR capture.
- The change alters active lifecycle cursor semantics beyond activation
  orientation.
- The change requires a new Ariad method contract that is not already represented
  in the approved Refinement docs.

## Approval Gate

Implementation remains blocked until Navigator approves this concrete plan.
