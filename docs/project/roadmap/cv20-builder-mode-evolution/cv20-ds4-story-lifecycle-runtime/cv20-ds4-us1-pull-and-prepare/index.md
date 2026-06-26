[< CV20.DS4](../index.md)

# CV20.DS4.US1 — Pull And Prepare

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Navigator can pull an Ariad roadmap item into active Builder delivery work and receive a Prepare report that reads the terrain, assesses story shape, names risks/rules, updates runtime cursor state, and stops before Plan.

---

## Acceptance Behavior

```text
Given Builder Mode is active for an Ariad-adopted journey
And the journey has a synced Builder delivery cursor
When the Navigator asks to pull a roadmap item into active work
Then Mirror runs the contained Pull operation
And records the active item in the runtime delivery cursor
And renders a Pull report with selected item, level, and why this level now
And does not execute Plan, Implement, Validation, Review, Coherence, or Done
```

```text
Given an item has been pulled for an Ariad-adopted journey
When the Navigator asks Builder to prepare the pulled item
Then Mirror runs the contained Prepare operation
And renders a Prepare report with context summary, story shape assessment, risks, and applicable rules
And updates the runtime cursor last delivery event to prepare
And does not create a Plan or pass the Plan checkpoint
```

---

## Scope

- Add contained Builder lifecycle operations for `pull` and `prepare`.
- Require Ariad adoption and a runtime delivery cursor.
- Accept explicit item metadata for the first slice: item code, title, level, and why-now text.
- Persist active item and last delivery event in the cursor after Pull.
- Render Pull and Prepare reports.
- Prepare reads available journey/project context lightly and reports conservative findings.
- Update Pi Builder skill so natural-language Pull/Prepare requests route to contained commands.
- Add focused tests for successful Pull, Prepare, missing cursor, missing adoption, and lifecycle boundary.

---

## Out Of Scope

- No Plan generation.
- No implementation work.
- No checkpoint approval flow.
- No roadmap file mutation beyond future stories.
- No automatic item recommendation.
- No full roadmap parser or taxonomy-aware selection beyond supplied item metadata.
- No Validation, Review, Coherence, or Done.

---

## Validation

Navigator validation through Pi/Mirror natural language:

```text
puxe o item Checkout Flow como user story para esta jornada porque é a próxima capacidade candidata
prepare o item puxado
```

Expected observation: Mirror renders Pull and Prepare reports, cursor shows the active item, and the response states that Plan/Implement/later lifecycle work was not executed.
