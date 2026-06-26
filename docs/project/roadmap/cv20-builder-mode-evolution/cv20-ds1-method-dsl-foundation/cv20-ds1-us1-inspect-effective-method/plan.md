[< Story](index.md)

# Plan — CV20.DS1.US1 Inspect Effective Method

## Pull

Pulled item: `CV20.DS1.US1 — Inspect Effective Method`.

Why this level now: TS1 created the generic method model and TS2 added Ariad as a built-in method fixture. The next coherent slice is user-visible inspection, so the Navigator can see what Builder method data exists before adoption and lifecycle behavior are implemented.

## Prepare

Context read:

- `docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds1-method-dsl-foundation/index.md`
- `src/memory/cli/build.py`
- `src/memory/builder/method_definition.py`
- `src/memory/builder/ariad_method.py`
- Prior TS1 and TS2 story shape

Story shape assessment: User Story. It adds Navigator-visible behavior through a CLI inspection route.

Risks:

- Accidentally treating built-in Ariad as adopted by every journey.
- Smuggling adoption state or persistence into an inspection-only story.
- Overdesigning final visual surfaces before the visual grammar implementation is needed.
- Creating a command shape that conflicts with later adoption/resume commands.

Applicable rules:

- Use TDD.
- Keep inspection read-only.
- Distinguish available method defaults from adopted/effective journey method.
- Use `uv run` for project Python commands.

## Scope

Add a `memory build` subcommand for method inspection as the contained operation used by Builder skill natural-language routing. Proposed command shape:

```bash
uv run python -m memory build inspect-method ariad
uv run python -m memory build inspect-method --journey builder-mode-evolution
```

Behavior without journey:

- show built-in Ariad method identity;
- show source as built-in method definition;
- show resolution layers;
- show lifecycle in order;
- show key checkpoints;
- show key policies;
- show surface bindings;
- show open questions.

Behavior with journey before adoption exists:

- show journey slug;
- show adopted method as `none`;
- show Ariad as available;
- explain that effective journey configuration, runtime delivery cursor, and active checkpoint cannot be inspected until adoption exists;
- suggest the future adoption command without executing it.

## Non-Goals

- No adoption command.
- No database schema or runtime state for adopted methods.
- No project, journey, or Navigator override merge behavior.
- No Builder resume integration.
- No lifecycle execution.
- No final card renderer if a simple deterministic text surface is enough for the slice.

## Implementation Approach

Start with tests in `tests/unit/memory/cli/test_build.py` or a new focused builder CLI test file if existing test structure suggests it.

Add a small rendering function, likely in a new Builder module rather than embedding all formatting in `src/memory/cli/build.py`. Candidate:

```text
src/memory/builder/method_inspection.py
```

The renderer can accept a `MethodDefinition` plus optional journey/adoption status and produce deterministic text. Since adoption is not implemented yet, journey inspection should explicitly report `adopted method: none`.

Then wire two read-only inspection forms in `src/memory/cli/build.py`: `memory build inspect-method ariad` for available method defaults, and `memory build inspect-method --journey SLUG` for the journey's effective method state.

Unknown method behavior should be explicit and non-zero:

```text
Error: Builder method 'x' not found. Available methods: ariad
```

Journey existence check should use current `MemoryClient` identity lookup when `--journey` is passed. If the journey does not exist, return the same style of error as `build load`.

## Test Strategy

Automated tests should prove:

- `build inspect-method ariad` renders built-in Ariad method identity and lifecycle;
- output includes `Pull escolhe o foco` and `Done registra e fecha`;
- output includes `after_plan` blocking `implement`;
- output includes commit/push/release policy summaries;
- `build inspect-method --journey <existing>` reports adopted method `none`, lists Ariad as available, and suggests adoption;
- unknown method exits with an error and lists `ariad` as available;
- unknown journey exits with an error and does not inspect method as adopted.

## Validation Route

Automated:

```bash
uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_method_definition.py
uv run ruff check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
uv run ruff format --check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
uv run mypy src/memory/builder src/memory/cli/build.py
```

Manual through Pi/Mirror natural language:

```text
qual método builder governa esta jornada?
```

Expected observation:

- Mirror routes the natural-language request through the Builder skill's method-inspection instruction;
- the response names the active journey;
- the response says the journey has not adopted a Builder method yet;
- the response lists Ariad as available and suggests adoption as a future action;
- the response does not mutate Builder mode, runtime state, or roadmap files.

CLI smoke support:

```bash
uv run python -m memory build inspect-method ariad
uv run python -m memory build inspect-method --journey builder-mode-evolution
```

## Checkpoint

Implementation must not start until the Navigator approves this plan.
