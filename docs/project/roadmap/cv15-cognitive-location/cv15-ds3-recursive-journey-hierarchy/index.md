[< CV15](../index.md)

# CV15.DS3 — Recursive Journey Hierarchy

**Status:** ✅ Done
**Release:** [v0.31.9](../../../../releases/v0.31.9.md)
**Source exploration:** Explorer Story `6126b3c0` — Árvore profunda de jornadas sem herança (local handoff)

---

## User Value

As a Mirror user whose work spans nested life areas, businesses, products, and
projects, I want journeys to form a tree of arbitrary depth so that Mirror can
reflect how I organize my work without silently merging the meaning or content
of related journeys.

---

## Outcome

Journeys can be placed at any depth. Mirror renders the complete hierarchy in
textual and web surfaces, shows the full lineage of a selected journey, rejects
cycles, and preserves every journey's independent identity and filesystem path.

---

## Scope

- Remove the current one-level hierarchy restriction.
- Validate every parent assignment against the full ancestor chain.
- Reject direct and indirect cycles before metadata is changed.
- Preserve stable journey ids and independent `project_path` values when a
  journey is moved.
- Recursively order and render journeys in:
  - `python -m memory journeys` / `mm-journeys`;
  - Workspace navigation;
  - Current Scene journey map;
  - All Journeys;
  - journey selection controls.
- Show the complete root-to-selected lineage in focused Scene.
- Keep nearby journeys limited to siblings of the selected node.
- Refuse removal of a journey while it has direct children.
- Record the new behavior as required parity work for the TypeScript core.

---

## Semantic Invariants

- `parent_journey` is organizational only.
- Activating a journey loads only that journey's context.
- Parentage does not inherit or aggregate documents, memories, conversations,
  tasks, attachments, instructions, status, routing, Builder state, or search.
- Parentage never infers, creates, moves, or deletes filesystem content.
- `project_path` never infers or changes parentage.
- Moving a journey changes only `parent_journey`.
- Removing a parent with children is refused; no automatic reparenting or
  cascade occurs.

---

## Non-goals

- No context or status inheritance.
- No filesystem watcher or synchronization service.
- No hierarchy inferred from paths.
- No directory creation or filesystem movement.
- No automatic reparenting, cascade, or structural repair.
- No aggregate parent status.
- No schema migration: the existing `parent_journey` metadata field remains the
  persistence contract.
- No simultaneous TypeScript implementation in this story; parity is carried by
  CV22 rather than blocking current product evolution.

---

## References

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Review](review.md)
- [Done](done.md)
- Explorer Story `6126b3c0` local handoff
- [CV15.DS1 Hierarchical Journey Organization](../cv15-ds1-hierarchical-journey-organization/index.md)
