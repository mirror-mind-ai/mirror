[< Story](index.md)

# Plan — CV9.E6.S3 Identity Map Page

## Goal

Turn the Atlas home from a generic card grid into the first intentional
editorial psyche-map slice, backed by real identity and persona data and honest
partial states for the rest of the Mirror.

## Scope

- Refine the Atlas surface read model so the web can distinguish core map
  regions from supporting/partial regions without composing meaning in JS.
- Make identity and persona cards more editorial and human-readable:
  - titles should prefer headings from identity/persona content when available;
  - metadata should still preserve layer/key and object identity;
  - links should point toward the future object detail route.
- Render Atlas as a psyche-map layout rather than a generic dashboard/sidebar:
  - central Ego / Identity area;
  - surrounding Personas, Memories, Shadow, Journeys, and Conversations regions;
  - visual honesty for partial/empty regions.
- Keep Atlas read-only.
- Keep Workspace and Docs functional.
- Add/adjust tests for Atlas surface composition and server/static contract where
  practical.

## Design Direction

Atlas should answer:

```text
What does my Mirror know about me, and where did that understanding come from?
```

The first slice should be simple but intentional:

```text
                 Self / Identity
                      │
        Personas ─── Ego / Voice ─── Journeys
                      │
           Shadow ─ Memories ─ Conversations
```

Implementation does not need a graph engine. Use a static CSS map with named
regions and cards. The goal is spatial/editorial rhythm, not physics or canvas.

## Data Contract

Prefer extending existing DTO metadata over adding a large new model. Candidate
region metadata:

```python
metadata={
  "atlas_role": "center" | "north" | "west" | "east" | "south" | "support",
  "data_readiness": "real" | "partial" | "empty",
}
```

Cards should continue to be `SurfaceCard` so S4 object detail can reuse links.
The web may use metadata for layout classes, but should not decide domain
meaning itself.

## Out of Scope

- Object detail implementation.
- Evidence drill-down UI.
- Live synthesis.
- Full memory/conversation interpretation.
- Workspace dashboard design.
- Complex interactive graph/canvas.

## Risks

- Atlas can easily become decorative. Every visual change should clarify region,
  readiness, identity/persona data, or next drill-down.
- If DTOs grow too much for layout-only needs, prefer metadata over bespoke web
  conditionals.
- Personal identity content may be long; previews must stay concise and safe.

## Implementation Steps

1. Extend surface DTOs if needed to carry region/card metadata.
2. Improve Atlas surface composition and unit tests for identity/persona region
   titles, layout roles, and readiness states.
3. Update static Atlas rendering to use a map layout and readiness badges.
4. Run focused web/surface tests and Ruff checks.
5. Manual browser validation against the personal Mirror.
