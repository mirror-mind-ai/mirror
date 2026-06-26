[< Story](index.md)

# Plan — CV20.DS2.TS1 Runtime Method State Sync

## Pull

Pulled item: `CV20.DS2.TS1 — Runtime Method State Sync`.

Why this level now: adoption cannot be a reliable User Story until Builder has a deterministic place to record and read the method adopted by a journey. This Technical Story creates that substrate before natural-language adoption behavior.

## Prepare

Context read:

- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/explorations/ariad-builder-dsl/method-dsl.md`
- `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_inspection.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/services/operating_mode.py`

Story shape assessment: Technical Story. The immediate behavior is internal state read/write. Navigator-facing adoption remains `CV20.DS2.US1`.

Risks:

- Choosing a persistence shape that becomes too narrow for later delivery cursor state.
- Hiding adoption state inside general operating-mode state.
- Making the state non-idempotent.
- Introducing database migration before the first state shape proves itself.

Applicable rules:

- Use TDD.
- Keep the slice state-only.
- Do not add natural-language adoption behavior yet.
- Do not add template generation or lifecycle execution.

## Scope

Add a Builder method adoption state helper, likely:

```text
/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_adoption.py
```

Represent the first state as:

```text
journey -> adopted_method
```

Preferred persistence for this slice: `runtime_sessions` with a stable session id such as:

```text
__builder_method_adoption__:<journey>
```

Metadata example:

```json
{"method": "ariad"}
```

This avoids a database migration while keeping state explicit and queryable. If adoption state later grows into a richer delivery cursor, a later story can migrate it into dedicated tables.

## Non-Goals

- No `memory build adopt` command.
- No Pi/Mirror natural-language adoption route.
- No template generation.
- No roadmap/documentation inventory.
- No active item or checkpoint cursor.
- No override merge.
- No lifecycle execution.

## Implementation Approach

Write focused tests first under:

```text
/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_method_adoption.py
```

Add functions such as:

```python
get_adopted_method(store, journey) -> str | None
set_adopted_method(store, journey, method) -> BuilderMethodAdoption
clear_adopted_method(store, journey) -> None
```

The setter should normalize journey and method ids, reject empty values, and be idempotent for the same journey/method pair.

No CLI behavior is required in this story unless a tiny internal smoke path becomes necessary for tests. CLI adoption belongs to `CV20.DS2.US1`.

## Test Strategy

Automated tests should prove:

- empty state returns `None`;
- setting Ariad for a journey can be read back;
- setting the same method twice remains idempotent;
- empty journey is rejected;
- empty method is rejected;
- clearing adoption removes the readable method;
- different journeys keep separate adopted methods.

## Validation Route

Automated:

```bash
uv run pytest tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/cli/test_build.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

Navigator manual validation is not required for this Technical Story.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
