[< CV20.DS1](../index.md)

# CV20.DS1.US1 — Inspect Effective Method

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Navigator can inspect Builder method configuration from the CLI.

The first slice makes the built-in Ariad method visible and distinguishes an available method from a method adopted by a journey. If a journey has not adopted Ariad yet, Builder must say so and point to the future adoption action without performing adoption.

---

## Acceptance Behavior

```text
Given Ariad exists as a built-in Builder method
When the Navigator inspects the Ariad method
Then Builder shows Ariad's method identity, lifecycle, checkpoints, policies, surfaces, and open questions
And it does not execute adoption, persistence, resume, or lifecycle work
```

```text
Given a journey has not adopted a Builder method yet
When the Navigator inspects the method for that journey
Then Builder says adopted method is none
And it distinguishes available built-in method defaults from effective journey configuration
And it shows that adoption is required before journey-specific Ariad state can be inspected
```

---

## Scope

- Add a CLI inspection path under `memory build`.
- Render a deterministic textual inspection of the built-in Ariad method.
- Support optional journey context for method inspection.
- For non-adopted journeys, show adoption status without mutating state.
- Add focused CLI/unit tests.

---

## Out Of Scope

- No Ariad adoption command.
- No runtime method-state persistence.
- No override merge implementation.
- No Builder resume behavior.
- No lifecycle execution.
- No final visual grammar polish beyond a clear deterministic text surface.

---

## Validation

Expected evidence:

```bash
uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_method_definition.py
uv run ruff check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
uv run ruff format --check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
uv run mypy src/memory/builder src/memory/cli/build.py
```

Manual validation route through Pi/Mirror natural language:

```text
qual método builder governa esta jornada?
```

Expected observation: if no Builder journey is active, Mirror says no Builder journey is active yet and asks the user to activate or name one. If Builder Mode is active for this journey, Mirror uses the Builder skill to inspect the active journey's effective method state, says that the journey has not adopted a Builder method yet, lists Ariad as available, and does not execute adoption.

---

## References

- [Plan](plan.md)
- [Ariad Method Fixture](../cv20-ds1-ts2-ariad-method-fixture/index.md)
