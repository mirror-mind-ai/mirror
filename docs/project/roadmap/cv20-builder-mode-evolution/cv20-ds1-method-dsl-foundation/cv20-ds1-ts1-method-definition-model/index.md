[< CV20.DS1](../index.md)

# CV20.DS1.TS1 — Method Definition Model

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Runtime has typed structures for Builder method DSL concepts.

The model is internal substrate for Ariad as a loadable method definition. It should represent method metadata, resolution layers, taxonomy, lifecycle events, checkpoints, artifacts, policies, surfaces, and open questions without executing Builder delivery work.

---

## Scope

- Add internal model types for Builder method definitions.
- Keep the model generic enough for future methods.
- Represent Ariad DSL concepts discovered in the exploration handoff.
- Provide validation for required method fields and obvious structural errors.
- Add focused unit tests for model construction and validation.

---

## Out Of Scope

- No Ariad fixture yet.
- No method file parser yet unless needed for model tests.
- No adoption command.
- No Builder resume behavior.
- No database persistence.
- No lifecycle execution.
- No CLI inspection command.

---

## Validation

This is a Technical Story. Validation is primarily automated and internal.

Expected evidence:

```bash
uv run pytest tests/unit/memory/builder/test_method_definition.py
uv run ruff check src/memory tests/unit/memory/builder/test_method_definition.py
uv run ruff format --check src/memory tests/unit/memory/builder/test_method_definition.py
uv run mypy src/memory
```

---

## References

- [Plan](plan.md)
- [Ariad Builder Method DSL](../../../../explorations/ariad-builder-dsl/method-dsl.md)
