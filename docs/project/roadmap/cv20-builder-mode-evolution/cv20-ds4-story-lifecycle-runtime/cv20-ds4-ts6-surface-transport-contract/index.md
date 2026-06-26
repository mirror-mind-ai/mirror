[< CV20.DS4](../index.md)

# CV20.DS4.TS6 — Surface Transport Contract

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Ariad surfaces are declared and handled as deterministic runtime artifacts independent of lifecycle phase. When the runtime emits a marked Ariad surface, the Driver transports the block verbatim and places any interpretation after the block.

---

## Context

Dogfooding US4 showed that phase-specific prompting is not enough. The runtime correctly emitted and persisted validation state, but the agent summarized a successful validation transition instead of returning the deterministic surface block. The missing contract was not a Validation-specific rule; it was a global surface transport invariant.

---

## Contract

```text
If Ariad runtime emits a marked surface, the Driver transports it.
The Driver may interpret surfaces, but never substitutes interpretation for transport.
```

Ariad method surfaces now carry these DSL-level defaults:

```text
transport = verbatim
marker_protocol = ariad_compact
interpretation_policy = after_block_only
```

---

## Scope

- Extend `SurfaceDefinition` with transport contract fields.
- Validate supported surface transport values.
- Assert Ariad surfaces use verbatim compact-marker transport.
- Strengthen Builder Mode skill instructions so the rule applies to all Ariad commands and phases.

---

## Validation

```text
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_lifecycle_ribbon.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/builder/test_resume_surface.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```
