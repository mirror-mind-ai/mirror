[< CV15](../index.md)

# CV15.DS2 — Scene Workspace Home

**Status:** ✅ Done  
**Release:** [v0.21.0](../../../../releases/v0.21.0.md)

---

## User Value

As a Mirror user with several active fields of work, I want Workspace to show me
where I am now, across the whole journey field or inside one selected journey,
so that the Mirror returns cognitive location rather than only a project list.

---

## Outcome

Workspace opens with **Current Scene**, a cognitive-location surface composed
from the hierarchical journey map, current horizons, recent movement signals,
and bounded LLM orientation grounded in existing Mirror data.

When no journey is selected, Current Scene shows the user's whole field. When a
journey is selected, Current Scene appears as the first journey tab and focuses
on that journey and its surrounding context: parent, children, siblings,
horizon, and recent movement.

---

## Scope

- Add a deterministic Scene read model to Workspace.
- Make Current Scene the default global Workspace home section.
- Render focused Current Scene as the first selected-journey tab.
- Include Journey Map / location path data using the existing one-level hierarchy.
- Include movement signals from recent conversations, memories, decisions, and tasks.
- Include horizon signals from journey title, status, stage/current focus, and description.
- Add bounded LLM synthesis over the deterministic Scene read model.
- Persist structured Scene Orientation internally and mark it outdated when source signals change.
- Show grounded orientation signals in the synthesis presentation.
- Provide fallback behavior when the LLM is unavailable or synthesis fails.

---

## Non-goals

- No new user-managed Scene entity.
- No change to journey assignment semantics.
- No parent-child memory, routing, Builder, extraction, task, or search inheritance.
- No recursive hierarchy beyond the one-level model delivered in DS1.
- No automatic mutation from synthesis.
- No hidden background regeneration loop.

---

## References

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [ES-002 Hierarchical Journeys](../../../exploration/es-002-hierarchical-journeys.md)
- [CV15.DS1 Hierarchical Journey Organization](../cv15-ds1-hierarchical-journey-organization/index.md)
