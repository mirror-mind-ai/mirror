# Plan — CV20.DS6.US3 Pull A Refinement Story

## Objective

Let the Navigator pull a composed Refinement Story (RS) from the Workbench into active Refinement Work. Builder should record the active RS in the refinement cursor, render a visible `REFINEMENT_STORY_PULLED` surface, and resume that RS on later Builder activation without confusing it with roadmap Delivery Work.

This story establishes the Refinement Work entry point. It does not implement Change Request lifecycle execution yet.

## User Outcome

As Navigator, I can say “pull this refinement story” or “work on RS-001 next,” and Builder enters Refinement Work for that RS. On later Builder activation, I see that Refinement Work is active and which CRs are available, instead of seeing only Delivery candidates.

## Current State

- `CV20.DS6.TS1` persists RS, CR, and refinement cursor records.
- `CV20.DS6.US2` lets the Navigator create RSs, capture CRs, attach CRs, and render RS overview surfaces.
- Builder Home shows durable Workbench counts, but `active RS` remains `none` because no Navigator-facing pull command exists.
- Existing Delivery cursor and Delivery lifecycle remain separate from Refinement state.

## Product Behavior

Add a Navigator-facing Refinement pull path:

1. Navigator identifies an RS to pull by natural language or direct runtime command.
2. Builder validates the RS exists for the active journey.
3. Builder sets the refinement cursor:
   - `active_refinement_story_id = <rs-id>`
   - `active_change_request_id = None` for now
   - `last_refinement_event = refinement_story_pulled`
4. Builder may update the RS status to `active` if the storage layer supports status updates in this story.
5. Builder renders `<<<ARIAD:REFINEMENT_STORY_PULLED>>>` visibly before commentary.
6. Later Builder activation/resume shows active Refinement Work and does not present the state as only Delivery Work.

The source field determines the flow:

```text
Roadmap item  -> Delivery Work
Workbench RS  -> Refinement Work
```

## Natural-Language Expectations

The primary experience is conversational Builder Mode. Direct CLI commands are the deterministic substrate.

Examples that should route to RS pull:

```text
Pull that refinement story.
Start working on RS-001.
Enter refinement work for Sandbox checkout refinements.
Let's pull the RS we just created.
```

Driver behavior:

- If the RS id/title is clear from recent context, use it.
- If multiple RSs could match, ask the Navigator to choose rather than guessing.
- If no RS is identified, show or ask for the RS id/title.
- Render the `REFINEMENT_STORY_PULLED` surface before commentary.
- Explain that active Refinement Work has been selected, but no CR cycle has started.
- If “pull” is ambiguous between a Delivery candidate and a Workbench RS, ask which field/item to pull.

## Proposed CLI Shape

```bash
uv run python -m memory build refinement-story pull \
  --journey <journey> \
  --refinement-story-id <rs-id>
```

Later activation:

```bash
uv run python -m memory build load <journey>
```

should show the active RS in Builder’s entry surface.

## API Strategy

Extend the Builder Workbench domain layer, not CLI-only code:

```python
pull_refinement_story(store: Store, *, journey: str, refinement_story_id: str) -> RefinementStoryOverview
get_active_refinement_story_overview(store: Store, journey: str) -> RefinementStoryOverview | None
```

Storage needs:

- Existing `set_refinement_cursor(...)` can record active RS.
- Add minimal status update helper only if needed:
  - `update_refinement_story_status(story_id, status)`
- Do not overload Delivery cursor with Refinement state.

Rendering:

- Add `render_refinement_story_pulled_surface(...)` to Workbench surface rendering.
- Reuse `RefinementStoryOverview` data so the surface can show RS and CR list.

## Surface Requirements

### Refinement Story Pulled

Show:

- journey
- RS id
- RS title
- RS status
- CR count
- ordered CR list with id/title/status
- active refinement cursor fields:
  - active RS id
  - active CR: none
- next Refinement move:
  - select/confirm first CR later (not implemented in this story)
- boundary:
  - RS was pulled into active Refinement Work
  - no CR lifecycle work was executed
  - no Delivery Work was pulled or executed

### Builder Activation/Resume

When an Ariad journey has active Refinement cursor state and no active Delivery item:

- Builder Home or resume surface should show:
  - active RS title/id
  - Workbench storage implemented
  - stored RS/CR counts
  - available move: continue active Refinement Work or inspect overview
- It must not auto-select a CR or start implementation.

If both Delivery cursor and Refinement cursor have active items, the surface must make both fields visible rather than hiding one. This story can choose a simple honest rendering without solving full conflict policy.

## Implementation Scope

- Add domain helper to pull an RS and set refinement cursor.
- Add optional storage method for RS status update to `active` if needed.
- Add `refinement-story pull` CLI command.
- Add `REFINEMENT_STORY_PULLED` surface renderer.
- Update Builder Home/resume refinement field to show active RS from durable cursor.
- Update `/mm-build` skill guidance for natural-language RS pull requests.
- Add focused tests for:
  - pulling an RS sets active refinement cursor
  - pulling does not mutate Delivery cursor
  - pulling does not set active CR
  - pull surface renders RS and CR list
  - Builder activation shows active RS after pull
  - natural-language routing guidance exists in `/mm-build`

## Out Of Scope

- Do not implement CR confirm/plan/implement/validate/done cycles.
- Do not select an active CR automatically.
- Do not implement RS Review, Coherence, or Close.
- Do not mutate roadmap Delivery status.
- Do not pull or execute a Delivery item.
- Do not implement conflict policy beyond honest visibility if Delivery and Refinement state coexist.

## Acceptance Criteria

- Navigator can pull a durable RS from the Workbench through runtime command and natural-language Builder routing.
- Pulling an RS sets active refinement cursor state for the journey.
- Pulling an RS does not mutate Delivery cursor state.
- Pulling an RS does not activate a CR or execute CR lifecycle work.
- Builder renders `REFINEMENT_STORY_PULLED` after pull.
- Later Builder activation shows the active RS in the Refinement field.
- If the requested RS does not exist or belongs to another journey, Builder refuses clearly.

## Validation Plan

Automated checks:

```bash
uv run pytest tests/unit/memory/storage/test_builder_workbench_store.py tests/unit/memory/builder/test_workbench.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/storage src/memory/builder src/memory/cli/build.py
git diff --check
```

Manual/Navigator validation must include direct command and natural-language routes.

Direct CLI route:

```bash
uv run python -m memory build refinement-story create --journey sandbox-pet-store --title "RS-002 — Sandbox refinement pull validation"
uv run python -m memory build change-request capture --journey sandbox-pet-store --refinement-story-id <rs-id> --title "Validate RS pull" --body "The RS should become active Refinement Work without starting a CR cycle."
uv run python -m memory build refinement-story pull --journey sandbox-pet-store --refinement-story-id <rs-id>
uv run python -m memory build load sandbox-pet-store
```

Natural-language route in Builder Mode:

```text
Navigator: Create a refinement story for validating RS pull.
Driver: creates RS and renders REFINEMENT_STORY_OVERVIEW.

Navigator: Capture a CR in that RS: the RS should become active without starting a CR cycle.
Driver: captures CR and renders CHANGE_REQUEST_CAPTURED.

Navigator: Pull that refinement story.
Driver: pulls the RS and renders REFINEMENT_STORY_PULLED.

Navigator: Load sandbox-pet-store Builder Mode.
Driver: renders Builder Home/Resume showing active RS, without selecting a CR or executing lifecycle work.
```

Expected observation:

- `REFINEMENT_STORY_PULLED` appears.
- Active RS is visible on later Builder activation.
- Active CR remains none.
- Delivery cursor is not changed.
- No CR lifecycle work is executed.

## Risks

- Pulling an RS may be confused with starting the first CR. Mitigation: explicit surface boundary and no active CR selection.
- Builder Home may become visually crowded if both Delivery and Refinement are active. Mitigation: show both fields honestly and defer richer conflict policy.
- Natural-language “pull” may ambiguously refer to Delivery pull vs Refinement pull. Mitigation: require RS context/id/title; ask when ambiguous.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
