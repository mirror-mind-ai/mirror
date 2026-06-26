[< Story](index.md)

# Plan — CV20.DS1.TS2 Ariad Method Fixture

## Pull

Pulled item: `CV20.DS1.TS2 — Ariad Method Fixture`.

Why this level now: `CV20.DS1.TS1` created the internal method-definition model. The next sustainable Technical Story is to express Ariad itself as data using that model before building adoption, resume, override resolution, or lifecycle execution.

## Prepare

Context read:

- `docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds1-method-dsl-foundation/index.md`
- `docs/project/explorations/ariad-builder-dsl/method-dsl.md`
- `src/memory/builder/method_definition.py`
- `tests/unit/memory/builder/test_method_definition.py`

Story shape assessment: Technical Story. The immediate value is internal substrate. Navigator-facing inspection remains planned for `CV20.DS1.US1`.

Risks:

- Accidentally implementing a parser or registry before the fixture is proven.
- Encoding lifecycle execution semantics into what should remain method data.
- Overfitting the generic model to Ariad during fixture construction.
- Making the fixture too thin to prove the DSL shape.

Applicable rules:

- Use TDD.
- Keep this slice fixture-only.
- Use `uv run` for project Python commands.
- Do not implement adoption, resume, persistence, CLI inspection, override resolution, or lifecycle execution in this story.

## Scope

Add a built-in Ariad method fixture, likely under:

```text
src/memory/builder/ariad_method.py
```

Add focused tests under:

```text
tests/unit/memory/builder/test_ariad_method.py
```

The fixture should represent:

- method id and label;
- DSL resolution layers;
- Ariad taxonomy levels and local state semantics;
- lifecycle events and meanings;
- after-plan checkpoint blocking implement;
- validation and review checkpoint intent where supported by the current model;
- history, push, and release policies as generic data;
- surface bindings;
- open questions for maintenance, final surfaces, and final DSL file format.

## Non-Goals

- No YAML parser or file loading.
- No method registry unless a tiny function is necessary to expose the built-in Ariad definition cleanly.
- No project, journey, or Navigator override merge behavior.
- No CLI command.
- No database schema or runtime cursor.
- No Builder `load` behavior changes.
- No lifecycle execution.

## Implementation Approach

Write tests first around a public fixture entry point such as:

```python
from memory.builder.ariad_method import ARIAD_METHOD, get_ariad_method
```

The fixture should be a `MethodDefinition` built from the existing model. A helper function may return the fixture if that makes future registry or resolution work cleaner.

If the current method model is missing a small representational hook needed for Ariad fixture data, prefer a minimal additive model change with focused tests. Do not expand into execution behavior.

## Test Strategy

Write tests first for:

- Ariad fixture validates with `validate_method_definition`;
- fixture id is `ariad` and resolution layers include method default, project config, journey config, and Navigator override;
- taxonomy includes `cv`, `delivery_story`, `user_story`, `technical_story`, and `task`;
- lifecycle is exactly Pull, Prepare, Plan, Implement, Validation, Review, Coherence, Done, with the Portuguese meanings from the exploration;
- `after_plan` checkpoint blocks `implement` and requires `plan` plus `navigator_approval`;
- policies preserve commit, push, and release data;
- open questions preserve maintenance and final surface/DSL format questions.

## Validation Route

Automated internal validation:

```bash
uv run pytest tests/unit/memory/builder/test_ariad_method.py
uv run ruff check src/memory tests/unit/memory/builder/test_ariad_method.py
uv run ruff format --check src/memory tests/unit/memory/builder/test_ariad_method.py
uv run mypy src/memory/builder
```

Navigator manual validation is not required for this Technical Story unless the fixture exposes a design ambiguity that needs product or process judgment.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
