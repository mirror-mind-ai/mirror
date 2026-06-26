[< Story](index.md)

# Plan — CV20.DS1.TS1 Method Definition Model

## Pull

Pulled item: `CV20.DS1.TS1 — Method Definition Model`.

Why this level now: DS1 is foundational and its first sustainable slice is a Technical Story. Before adoption, resume, or lifecycle execution can exist, Builder needs an internal representation for a delivery method.

## Prepare

Context read:

- `docs/project/explorations/ariad-builder-dsl/index.md`
- `docs/project/explorations/ariad-builder-dsl/method-dsl.md`
- `docs/project/roadmap/cv20-builder-mode-evolution/index.md`
- `docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds1-method-dsl-foundation/index.md`
- `docs/process/development-guide.md`
- `src/memory/cli/build.py`
- `src/memory/services/operating_mode.py`
- `src/memory/services/explorer_story.py`
- Existing unit-test layout under `tests/unit/memory/`

Story shape assessment: Technical Story. The immediate value is internal substrate. Navigator-facing behavior arrives later in `CV20.DS1.US1 — Inspect effective method`.

Risks:

- Overbuilding a full parser before the model is proven.
- Encoding Ariad-specific behavior into generic Builder structures.
- Creating validation so strict that overrides become hard later.
- Creating validation so loose that malformed method definitions fail late.

Applicable rules:

- Use TDD.
- Keep this slice model-only.
- Use `uv run` for project Python commands.
- Do not implement adoption, resume, persistence, or lifecycle execution in this story.

## Scope

Implement a new internal Builder method model module, likely under:

```text
src/memory/builder/method_definition.py
```

Add focused tests under:

```text
tests/unit/memory/builder/test_method_definition.py
```

The model should cover these concepts from the exploration DSL:

- method metadata;
- resolution layers;
- taxonomy levels and local state semantics;
- lifecycle events and meanings;
- checkpoints;
- policies;
- surfaces;
- open questions.

## Non-Goals

- No YAML parser.
- No Ariad fixture file.
- No CLI command.
- No database schema or runtime cursor.
- No Builder `load` behavior changes.
- No generated templates.

## Implementation Approach

Use dataclasses or typed standard-library structures first. Prefer simple immutable or value-oriented types where practical.

Proposed objects:

```text
MethodDefinition
DslResolution
Taxonomy
TaxonomyLevel
StateDefinition or state semantics mapping
LifecycleEvent
CheckpointDefinition
PolicyDefinition
SurfaceDefinition
OpenQuestion
```

Provide a validation entry point such as:

```python
validate_method_definition(definition: MethodDefinition) -> None
```

or a method on `MethodDefinition`, depending on what keeps call sites clean.

Validation should catch:

- empty method id;
- duplicate taxonomy level ids;
- duplicate lifecycle event ids;
- lifecycle events without meaning;
- checkpoints blocking unknown events;
- surfaces referencing unknown events when the event is meant to be lifecycle-bound;
- taxonomy child references to unknown levels;
- state semantics declared for states not allowed by that level.

Validation should not try to prove Ariad correctness yet. That belongs in DS1.TS2 when the Ariad method fixture exists.

## Test Strategy

Write tests first for:

- constructing a minimal valid method definition;
- rejecting duplicate taxonomy levels;
- rejecting duplicate lifecycle events;
- rejecting checkpoint references to unknown lifecycle events;
- rejecting child level references to unknown taxonomy levels;
- rejecting state semantics for disallowed states;
- preserving generic policy payloads without Ariad-specific code.

## Validation Route

Automated internal validation:

```bash
uv run pytest tests/unit/memory/builder/test_method_definition.py
uv run ruff check src/memory tests/unit/memory/builder/test_method_definition.py
uv run ruff format --check src/memory tests/unit/memory/builder/test_method_definition.py
uv run mypy src/memory
```

Navigator manual validation is not required for this Technical Story unless the automated evidence reveals ambiguous design trade-offs.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
