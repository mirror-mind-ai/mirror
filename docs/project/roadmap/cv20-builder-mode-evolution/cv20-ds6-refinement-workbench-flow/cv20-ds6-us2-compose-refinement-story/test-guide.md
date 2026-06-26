# Test Guide — CV20.DS6.US2 Compose A Refinement Story

## Purpose

Prove that Navigator-facing Builder commands and natural-language Builder interaction can compose durable Refinement Workbench records without starting Refinement flow.

## Automated Coverage

### Domain and Storage

- Create RS with title/description/source/provenance.
- Capture unassigned CR.
- Capture CR directly attached to RS.
- Attach existing CR to RS and preserve ordering.
- Produce RS overview with ordered CRs.
- Reject attaching CR to RS from another journey.

### CLI

- `refinement-story create` creates a durable RS and renders an overview or creation surface.
- `change-request capture` creates a durable CR and renders `CHANGE_REQUEST_CAPTURED`.
- `change-request capture --refinement-story-id` attaches the CR and can render/point to overview.
- `change-request attach` associates an existing CR and renders overview or attach confirmation.
- `refinement-story overview` renders `REFINEMENT_STORY_OVERVIEW`.
- Commands do not set active refinement cursor.
- Commands do not mutate Delivery cursor.

### Natural-Language Contract

- `/mm-build` guidance routes "capture this as a CR"-style requests to CR capture.
- `/mm-build` guidance routes "create/compose a refinement story"-style requests to RS creation/composition.
- Under-specified requests ask only for missing essentials rather than inventing title/body/RS target.
- Marked Ariad surfaces are rendered verbatim before commentary.

### Builder Home

- After composition, Builder Home reflects durable RS/CR counts.
- Builder Home still does not pull or execute lifecycle work.

## Required Commands

```bash
uv run pytest tests/unit/memory/storage/test_builder_workbench_store.py tests/unit/memory/builder/test_workbench.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/storage src/memory/builder src/memory/cli/build.py
git diff --check
```

## Manual Validation Route

### Direct CLI

```bash
uv run python -m memory build refinement-story create --journey sandbox-pet-store --title "RS-001 — Sandbox checkout refinements"
uv run python -m memory build change-request capture --journey sandbox-pet-store --refinement-story-id <rs-id> --title "Clarify checkout state" --body "The sandbox docs disagree about whether CV2.DS1 is in progress or not."
uv run python -m memory build refinement-story overview --journey sandbox-pet-store --refinement-story-id <rs-id>
uv run python -m memory build load sandbox-pet-store
```

### Natural Language

In Builder Mode, validate that the Driver routes conversational requests to the runtime commands:

```text
Navigator: Create a refinement story for sandbox checkout polish.
Expected: Driver creates an RS and renders REFINEMENT_STORY_OVERVIEW.

Navigator: Capture a CR in that RS: the sandbox docs disagree about whether CV2.DS1 is in progress.
Expected: Driver captures the CR and renders CHANGE_REQUEST_CAPTURED before commentary.

Navigator: Show me that refinement story.
Expected: Driver renders REFINEMENT_STORY_OVERVIEW with the CR listed.
```

If the request is under-specified, the Driver should ask only for missing essentials rather than inventing title/body/RS target.

## Expected

- `CHANGE_REQUEST_CAPTURED` appears after capture.
- `REFINEMENT_STORY_OVERVIEW` appears for overview.
- CR appears under the chosen RS.
- Builder Home durable counts increase.
- No RS is pulled.
- No CR cycle starts.
- No Delivery lifecycle work is executed.

## Non-Goals To Guard

- Do not implement RS pull.
- Do not implement active Refinement cursor transitions except read-only verification that composition leaves it unset.
- Do not implement CR lifecycle commands.
- Do not import seed CRs automatically.
