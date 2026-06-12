[< CV20.DS3](../index.md)

# CV20.DS3.US1 — Resume Ariad Journey

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

When Builder Mode loads an Ariad-adopted journey, Mirror renders a Builder Resume Surface showing method, resumability, roadmap position, cursor fields, and allowed next actions.

---

## Acceptance Behavior

```text
Given Builder Mode is active for a journey that adopted Ariad
And the journey has a synced delivery cursor
When Builder Mode loads the journey
Then Mirror renders the Builder Resume Surface
And the surface shows adopted method ariad
And the surface shows roadmap position when one is available
And the surface shows active item, active checkpoint, pending confirmation, last delivery event, and allowed next actions
And no story lifecycle work is executed
```

---

## Scope

- Render the resume surface during `memory build load` for adopted journeys.
- Use DS3.TS1 resume-state reader.
- Use DS3.TS2 roadmap position resolver.
- Keep non-adopted Builder load behavior unchanged.

---

## Validation

Navigator validation through Pi/Mirror natural language:

```text
ative Builder Mode na jornada sandbox-pet-store
```

Expected observation: the Builder load response includes `■ BUILDER RESUME`, journey `sandbox-pet-store`, adopted method `ariad`, cursor fields, allowed next actions, and the boundary that no story lifecycle work was executed.
