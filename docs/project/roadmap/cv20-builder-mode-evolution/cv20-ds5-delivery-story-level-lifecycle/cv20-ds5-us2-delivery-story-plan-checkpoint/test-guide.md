[< Story](index.md)

# Test Guide — CV20.DS5.US2

## Automated Validation

```bash
uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_story_plan.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_story_plan.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_story_plan.py
git diff --check
```

## E2E Decision

Browser/UI E2E is not required. Pi/Builder natural interaction validation is required because this is a User Story.

## Navigator Validation

Validate in Builder Mode as the Navigator, without manually invoking CLI commands:

1. Set up an active Ariad Delivery Story with `navigator_flow_unit=delivery_story`.
2. Say: `quero seguir no nível da DS`.
3. Expected: Builder returns `<<<ARIAD:NAVIGATOR_FLOW_UNIT>>>` verbatim with `delivery_story` selected.
4. Say: `planeje a Delivery Story`.
5. Expected: Builder returns `<<<ARIAD:DELIVERY_STORY_PLAN_CHECKPOINT>>>` verbatim and states implementation remains blocked until approval.
6. Say: `aprovo o plano da DS`.
7. Expected: Builder returns the approved `DELIVERY_STORY_PLAN_CHECKPOINT` surface verbatim.
8. Confirm no implementation, push, release, or child-story closure occurs.

## Validation Evidence

Pending implementation and validation.
