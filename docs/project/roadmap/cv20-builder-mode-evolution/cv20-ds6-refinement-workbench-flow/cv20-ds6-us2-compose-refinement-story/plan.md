# Plan — CV20.DS6.US2 Compose A Refinement Story

## Objective

Expose the first Navigator-facing Workbench composition path: create a durable Refinement Story (RS), capture Change Requests (CRs), associate CRs to an RS, and render visible Ariad Refinement surfaces without pulling the RS into active Refinement Work or starting CR lifecycle cycles.

This story turns the durable storage substrate from `CV20.DS6.TS1` into usable composition behavior.

## User Outcome

As Navigator, I can ask Builder to capture refinement work while dogfooding, and Builder records it in the Workbench instead of inflating it into roadmap Delivery Work or leaving it only in conversation memory.

## Current State

- `CV20.DS6.US1` added Builder Home with Delivery and Refinement fields.
- `CV20.DS6.TS1` added durable Workbench tables and APIs:
  - `builder_refinement_stories`
  - `builder_change_requests`
  - `builder_refinement_cursors`
  - `BuilderWorkbenchStore`
  - `memory.builder.workbench` helpers
- Builder Home can show storage as implemented and durable RS/CR counts.
- There is still no Navigator-facing command to create RSs or capture CRs.
- Seed CRs in the DS6 plan remain provisional markdown and should not be auto-imported in this story.

## Product Behavior

The primary product experience is conversational Builder Mode between Driver and Navigator. CLI commands are the deterministic runtime substrate, not the user-facing ideal.

Expected natural-language flows:

1. Navigator asks to capture a refinement, e.g. "capture this as a CR", "registre isso como refinamento", or "add a CR about the plan overwrite issue".
2. Driver identifies this as Refinement Work, not Delivery Work, and asks only for missing essentials if needed: CR title/body and whether to attach it to an existing RS or keep it unassigned.
3. Navigator asks to create or compose a Refinement Story, e.g. "create an RS for Builder lifecycle polish" or "compose a refinement story with these CRs".
4. Driver creates the RS, captures/attaches CRs, and renders the marked Ariad surfaces verbatim before commentary.
5. Driver explains the boundary in plain language: the work was captured/composed only; no RS was pulled and no CR lifecycle work started.
6. Navigator can ask "show me the RS" / "what CRs are in this refinement story?" and Driver renders the overview surface.

Natural-language routing expectations:

- Phrases like "capture this", "create a CR", "register this refinement", "add this to the workbench", or "this should be a refinement" route to CR capture.
- Phrases like "create an RS", "compose a refinement story", or "group these CRs" route to RS creation/composition.
- If the Navigator's request implies immediate fixing, Driver should distinguish capture from execution and ask whether to only capture the CR or switch into the appropriate lifecycle once Refinement pull exists.
- If there is no obvious RS target, Driver may keep the CR unassigned or ask whether to create a new RS.
- Driver must not silently promote a CR to Delivery Work; promotion requires explicit Navigator choice or a clear policy trigger.

Add CLI/runtime commands that can be routed by `/mm-build` and used directly:

1. Create a Refinement Story.
2. Capture a Change Request, either unassigned or attached to an RS.
3. Attach an existing CR to an existing RS.
4. Render an RS overview showing associated CRs.

Required Ariad surfaces:

- `<<<ARIAD:CHANGE_REQUEST_CAPTURED>>>`
- `<<<ARIAD:REFINEMENT_STORY_OVERVIEW>>>`

The surfaces must be visible product output before commentary, following the strengthened surface contract.

## Proposed CLI Shape

Names may be adjusted during implementation, but keep the behavior narrow and explicit:

```bash
uv run python -m memory build refinement-story create \
  --journey <journey> \
  --title "<title>" \
  [--description "<description>"]

uv run python -m memory build change-request capture \
  --journey <journey> \
  --title "<title>" \
  --body "<body>" \
  [--refinement-story-id <rs-id>] \
  [--source dogfood]

uv run python -m memory build change-request attach \
  --journey <journey> \
  --change-request-id <cr-id> \
  --refinement-story-id <rs-id>

uv run python -m memory build refinement-story overview \
  --journey <journey> \
  --refinement-story-id <rs-id>
```

If nesting under `build` becomes too cumbersome, an equivalent flat command set is acceptable, but it must remain clearly Builder/Workbench scoped.

## API Strategy

Use the domain helpers created in TS1 rather than direct SQL in CLI code:

- `create_refinement_story(...)`
- `capture_change_request(...)`
- `attach_change_request_to_story(...)`
- `get_workbench_snapshot(...)`

Add any missing read/overview helper in `memory.builder.workbench`, for example:

```python
@dataclass(frozen=True)
class RefinementStoryOverview:
    story: RefinementStoryRecord
    change_requests: tuple[ChangeRequestRecord, ...]

get_refinement_story_overview(store: Store, journey: str, story_id: str) -> RefinementStoryOverview
```

Rendering should live in a Builder module, likely `src/memory/builder/workbench_surfaces.py`, not in CLI command handlers.

## Surface Requirements

### Change Request Captured

Show:

- journey
- CR id
- CR title
- status
- source/provenance when present
- attached RS id/title, or `unassigned`
- boundary: CR was captured only; no RS was pulled; no CR lifecycle work was executed

### Refinement Story Overview

Show:

- journey
- RS id
- RS title
- RS status
- CR count
- ordered CR list with id/title/status
- available next moves:
  - add another CR
  - attach an existing CR
  - pull RS later (not implemented in this story)
- boundary: overview only; no RS was pulled; no CR lifecycle work was executed

## Implementation Scope

- Add Builder Workbench composition commands to `src/memory/cli/build.py`.
- Add Builder-domain overview helper if needed.
- Add Workbench surface renderer(s).
- Update `/mm-build` skill guidance so natural-language requests for capturing refinement can route to the new commands and render Ariad surfaces verbatim.
- Add conversational contract examples to `/mm-build` so the Driver knows how to translate Navigator language into create/capture/attach/overview commands without skipping confirmation when required.
- Add focused tests for:
  - creating an RS
  - capturing an unassigned CR
  - capturing a CR attached to an RS
  - attaching an existing CR to an RS
  - rendering overview with ordered CRs
  - ensuring commands do not set active refinement cursor
  - ensuring Delivery cursor is not mutated

## Out Of Scope

- Do not pull a Refinement Story into active Refinement Work.
- Do not implement CR confirm/plan/implement/validate/done cycles.
- Do not implement RS Review, Coherence, or Close.
- Do not auto-import seed CRs from DS6 markdown.
- Do not implement automatic clustering/grouping.
- Do not mutate roadmap Delivery state.
- Do not implement web UI.

## Acceptance Criteria

- Navigator can create a durable RS from CLI/runtime and through natural-language Builder interaction.
- Navigator can capture a durable CR without an RS through CLI/runtime and natural language.
- Navigator can capture a durable CR directly into an RS through CLI/runtime and natural language.
- Navigator can attach an existing CR to an RS through CLI/runtime and natural language.
- Driver asks for missing title/body/RS target information instead of guessing when the conversational request is under-specified.
- Builder renders `CHANGE_REQUEST_CAPTURED` after CR capture.
- Builder renders `REFINEMENT_STORY_OVERVIEW` for an RS with ordered CRs.
- Builder Home reflects updated durable RS/CR counts after composition.
- Composition commands do not pull RS, activate CR, mutate Delivery cursor, or execute lifecycle work.

## Validation Plan

Automated checks:

```bash
uv run pytest tests/unit/memory/storage/test_builder_workbench_store.py tests/unit/memory/builder/test_workbench.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/storage src/memory/builder src/memory/cli/build.py
git diff --check
```

Manual/Navigator validation should include both direct CLI and natural-language Builder routes.

Direct CLI route:

```bash
uv run python -m memory build refinement-story create --journey sandbox-pet-store --title "RS-001 — Sandbox checkout refinements"
uv run python -m memory build change-request capture --journey sandbox-pet-store --refinement-story-id <rs-id> --title "Clarify checkout state" --body "The sandbox docs disagree about whether CV2.DS1 is in progress or not."
uv run python -m memory build refinement-story overview --journey sandbox-pet-store --refinement-story-id <rs-id>
uv run python -m memory build load sandbox-pet-store
```

Natural-language route in Builder Mode:

```text
Navigator: Create a refinement story for sandbox checkout polish.
Driver: creates the RS through the runtime command and renders the overview surface.

Navigator: Capture a CR in that RS: the sandbox docs disagree about whether CV2.DS1 is in progress.
Driver: captures the CR through the runtime command, renders CHANGE_REQUEST_CAPTURED, then renders or offers the RS overview.

Navigator: Show me that refinement story.
Driver: renders REFINEMENT_STORY_OVERVIEW.
```

Expected observation:

- RS creation succeeds durably.
- CR capture renders `CHANGE_REQUEST_CAPTURED`.
- Overview renders `REFINEMENT_STORY_OVERVIEW` with the CR listed.
- Builder Home counts increase.
- No RS is pulled and no lifecycle work is executed.

## Risks

- CLI command shape may become too broad. Mitigation: keep only create/capture/attach/overview.
- Composition may imply execution. Mitigation: every surface states no pull/lifecycle boundary.
- Seed CR migration temptation. Mitigation: preserve seed markdown as provisional until an explicit import/migration story.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
