[< CV20.DS3](../index.md)

# CV20.DS3.TS1 — Builder Resume Cursor Reader

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Builder has an internal resume-state reader that combines Ariad adoption state and DS2 delivery cursor state into a single object for resume surfaces.

This story does not change Builder load output yet. It prepares the substrate for `CV20.DS3.US1 — Resume Ariad Journey`.

---

## Acceptance Behavior

```text
Given a journey has adopted Ariad
And the journey has a synced delivery cursor
When Builder reads resume state for that journey
Then it returns the adopted method, delivery cursor fields, and allowed next-action hints
And it marks the journey as resumable
```

```text
Given a journey has not adopted a Builder method
When Builder reads resume state for that journey
Then it returns a non-resumable state with an adoption-required reason
```

```text
Given a journey has adopted Ariad but has no delivery cursor
When Builder reads resume state for that journey
Then it returns a non-resumable state with a cursor-sync-required reason
```

---

## Scope

- Add a small Builder resume-state model/helper.
- Read adopted method state from `method_adoption`.
- Read delivery cursor state from `delivery_cursor`.
- Produce allowed next-action hints from the cursor state.
- Add focused unit tests.
- Avoid changing `memory build load` output in this technical story.

---

## Out Of Scope

- No Builder Resume Surface rendering in `build load`.
- No roadmap parser.
- No active roadmap item resolver.
- No checkpoint inference.
- No lifecycle execution.
- No Pi/Mirror manual validation required.

---

## Validation

Technical validation:

```bash
uv run pytest tests/unit/memory/builder/test_resume_state.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
```

Expected observation: resume-state helper reports resumable state only when Ariad is adopted and a delivery cursor exists.
