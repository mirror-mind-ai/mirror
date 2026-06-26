[< CV20.DS1](../index.md)

# CV20.DS1.TS2 — Ariad Method Fixture

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Ariad lifecycle, taxonomy, checkpoints, policies, and surfaces are represented as data using the Builder method-definition model.

This story turns the exploration DSL into the inaugural built-in method fixture without introducing adoption, resume, persistence, CLI inspection, or lifecycle execution.

---

## Scope

- Add a built-in Ariad method fixture using `MethodDefinition`.
- Represent Ariad taxonomy, lifecycle, plan checkpoint, validation/review checkpoint surfaces, policies, and open questions as data.
- Validate the fixture with the existing method-definition validator.
- Add focused unit tests proving Ariad loads as a valid method and carries the expected method semantics.

---

## Out Of Scope

- No YAML parser.
- No method override resolution.
- No CLI inspection command.
- No adoption command.
- No runtime persistence.
- No lifecycle execution.
- No Builder `load` behavior changes.

---

## Validation

This is a Technical Story. Validation is primarily automated and internal.

Expected evidence:

```bash
uv run pytest tests/unit/memory/builder/test_ariad_method.py
uv run ruff check src/memory tests/unit/memory/builder/test_ariad_method.py
uv run ruff format --check src/memory tests/unit/memory/builder/test_ariad_method.py
uv run mypy src/memory/builder
```

---

## References

- [Plan](plan.md)
- [Ariad Builder Method DSL](../../../../explorations/ariad-builder-dsl/method-dsl.md)
