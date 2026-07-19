[< CV15](../index.md)

# CV15.DS1 — Hierarchical Journey Organization

**Status:** ✅ Done  
**Release:** [v0.20.0](../../../../releases/v0.20.0.md)

---

## User Value

As a Mirror user with many active journeys, I want to organize journeys under one
visible parent level so that the web console and Mirror textual surfaces return a
coherent map of my fields of work without changing how journey memory, routing,
Builder context, or extraction behave.

---

## Outcome

Journeys can optionally name a parent journey. Mirror renders that relationship
hierarchically wherever journeys are listed in the web console and in the
`mm-journeys` textual surface.

---

## Scope

- Add `parent_journey` support to journey metadata.
- Allow setting parent journey during **New journey** creation.
- Allow editing parent journey in Journey Settings.
- Validate parent assignment:
  - parent exists;
  - journey cannot parent itself;
  - first slice supports only one level;
  - no cycles.
- Render journeys hierarchically across web surfaces:
  - Workspace journey navigation;
  - journey selection dropdowns;
  - conversation assignment dropdowns;
  - New journey parent selector;
  - any other current web journey list.
- Render journeys hierarchically in `mm-journeys` / `python -m memory journeys`.

---

## Non-goals

- No Scene surface in this release.
- No LLM synthesis in this release.
- No automatic context inheritance from parent to child.
- No conversation, memory, task, attachment, Builder, routing, or extraction merging.
- No journey slug rename.
- No journey deletion cascade.

---

## References

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [ES-002 Hierarchical Journeys](../../../exploration/es-002-hierarchical-journeys.md)
