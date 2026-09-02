[< CV20.DS12](../index.md)

# CV20.DS12.TS2 — Define Legacy Workbench Migration Boundary

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

The project explicitly decides how the shipped CV20.DS6 SQLite Workbench relates to the
new canonical project files, without reading, transforming, or deleting local records.
The decision protects schema compatibility while preventing accidental dual authority.

## Acceptance Behavior

```text
Given project files now own canonical shared Refinement state
And production still ships an SQLite Workbench and its commands
When the transition boundary is recorded
Then files are named as the only shared authority
And legacy rows and migrations are preserved without implicit import
And unsafe automatic identity/status mapping is rejected
And the next compatibility change is isolated as a later story
```

## Scope

- Inventory shipped schema, storage, commands, Home surface, skill routing, reference
  documentation, and TypeScript schema coupling.
- Compare bounded transition options.
- Record one authority and compatibility decision in project documentation.
- Define prohibitions and explicit triggers for future export, deprecation, or removal.
- Name the smallest follow-up needed to route file-enabled projects safely.

## Out Of Scope

- Reading personal Workbench rows or production counts.
- Exporting, migrating, deleting, or reconciling data.
- Changing Python/TypeScript source, commands, surfaces, storage, or lifecycle behavior.
- Removing migrations `015`/`016` or TypeScript schema recognition.
- Implementing CR001, CR002, or CR004.

## Validation

A reviewer can determine which authority wins, why automatic migration is unsafe, what
legacy behavior remains compatible, and which future event permits behavior or schema
changes. Documentation and scope checks pass with no executable changes.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
