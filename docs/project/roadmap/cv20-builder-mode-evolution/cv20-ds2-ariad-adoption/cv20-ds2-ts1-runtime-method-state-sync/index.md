[< CV20.DS2](../index.md)

# CV20.DS2.TS1 — Runtime Method State Sync

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Runtime can record and read the Builder method adopted by a journey.

This is the operational substrate for Ariad adoption. It introduces the smallest stable state needed for later User Stories to say whether a journey has adopted Ariad without inferring that from the built-in method fixture.

---

## Scope

- Add a Builder method adoption state helper.
- Persist `journey -> adopted_method` state.
- Read adopted method state for a journey.
- Keep the state idempotent and explicit.
- Add focused unit tests for write, read, idempotency, and empty state.

---

## Out Of Scope

- No natural-language adoption behavior.
- No `memory build adopt` command yet.
- No template generation.
- No documentation inventory.
- No delivery cursor with active item or checkpoint.
- No Builder resume behavior.
- No lifecycle execution.

---

## Validation

This is a Technical Story. Validation is automated and internal.

Expected evidence:

```bash
uv run pytest tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/cli/test_build.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

---

## References

- [Plan](plan.md)
- [CV20.DS1.US1 — Inspect Effective Method](../../cv20-ds1-method-dsl-foundation/cv20-ds1-us1-inspect-effective-method/index.md)
