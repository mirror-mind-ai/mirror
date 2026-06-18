[< Story](index.md)

# Test Guide — CV20.DS6.US1

## Automated Validation

Run focused checks for Builder Home, roadmap snapshot, and Builder load behavior:

```bash
uv run pytest tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

If implementation touches the Pi skill contract, also run a targeted diff check
and inspect the rendered skill instructions.

## Manual Navigator Validation

Activate Builder for the dogfooding journey:

```bash
uv run python -m memory build load builder-mode-evolution
```

Expected observation:

- Builder transition surface appears.
- Builder activation or marked Ariad surface orients around Builder Home / work fields.
- Delivery field shows CV20 / CV20.DS6.US1 rather than CV10.
- Refinement field is visible.
- Refinement field is honest that durable Workbench storage is not implemented yet.
- Boundary says no item was pulled and no lifecycle work was executed unless an active lifecycle item already exists.

Pass condition: the Navigator can understand the current Delivery field and the
nascent Refinement field from activation without using a separate command and
without confusing orientation with execution.

Fail condition: activation remains Delivery-only, hides Refinement, shows an
irrelevant roadmap focus, omits required marked surfaces, or implies that
Workbench/RS/CR behavior already exists.

## Regression Checks

Active lifecycle resume must remain unchanged:

```text
Given an Ariad journey has an active item or pending confirmation
When Builder loads the journey
Then Builder renders the existing resume surface rather than a no-active-item Builder Home
```

Non-Ariad journeys must remain unchanged:

```text
Given a journey has not adopted Ariad
When Builder loads the journey
Then Builder uses the base Builder Mode transition without Ariad Builder Home surfaces
```

## Validation Evidence

Pending implementation and validation.
