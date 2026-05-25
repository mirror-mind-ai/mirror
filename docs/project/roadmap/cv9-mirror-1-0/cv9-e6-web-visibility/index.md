[< CV9 Mirror Mind 1.0](../index.md)

# CV9.E6 — Web Visibility

**Epic:** Make the contents of a user's Mirror visible through a local web surface  
**Status:** ✅ Done

---

## What This Is

CV9.E6 turns the existing local web console from a documentation browser into a
read-only visibility surface for Mirror data. The goal is not to build an admin
panel. The goal is to let a user understand what exists inside their Mirror:
identity, personas, memories, journeys, conversations, and the provenance behind
claims where available.

The product model is perspective-based:

- **Atlas** reveals meaning through an editorial psyche map.
- **Workspace** coordinates movement through an analytical dashboard.

Both perspectives use the same Mirror Core data and the same Web Surface
architecture. They differ in information architecture and visual rhythm, not in
source of truth.

---

## Scope

CV9.E6 delivers a read-only web visibility path for Mirror 1.0:

- a Core Surface layer for web read models;
- a stable web shell with perspective selection and switching;
- a user-home default perspective preference;
- an Identity vertical slice with real identity and persona data;
- object detail and evidence affordances for supported objects;
- a first Workspace dashboard slice after the Atlas path proves the architecture;
- manual validation against the personal Mirror.

---

## Non-goals

- Editing identity, memories, journeys, conversations, or tasks.
- A fully interactive graph engine.
- Live LLM synthesis during page rendering.
- Remote serving or multi-user web authentication.
- A separate Atlas database model or Workspace database model.
- Full evidence graph for every object.

---

## Stories

| Code | Story | User-visible outcome | Status |
|------|-------|----------------------|--------|
| [CV9.E6.S1](cv9-e6-s1-web-surface-foundation/index.md) | Web Surface Foundation | The core exposes typed read models for Atlas, Workspace, object detail, evidence, and search without web routes querying internal data directly | ✅ Done |
| [CV9.E6.S2](cv9-e6-s2-perspective-shell/index.md) | Perspective Shell and Preference | The local web app lets the user choose Atlas or Workspace, stores the default in the user home, and keeps a stable shell across perspectives | ✅ Done |
| [CV9.E6.S3](cv9-e6-s3-atlas-identity-persona-map/index.md) | Identity Map Page | Identity opens as a reflective map of Self, Ego, Shadow, Personas, and Memories | ✅ Done |
| [CV9.E6.S4](cv9-e6-s4-object-detail-evidence/index.md) | Object Detail and Source Context | Supported objects open into a common detail view with related objects, rendered content, metadata, and clear source context | ✅ Done |
| [CV9.E6.S5](cv9-e6-s5-workspace-dashboard/index.md) | Workspace Dashboard Slice | Workspace shows a journey-centric workspace with briefing, conversations, tasks, memories, and decisions | ✅ Done |
| [CV9.E6.S6](cv9-e6-s6-personal-mirror-validation/index.md) | Personal Mirror Validation | The 1.0 web visibility surface is validated against the real personal Mirror and documented with evidence and follow-up | ✅ Done |

---

## Data Coverage Target

The 1.0 surface should be honest about data readiness.

```text
Identity
  real in 1.0

Personas
  real in 1.0

Memories
  partial in 1.0

Journeys
  real or partial in 1.0, depending on current service readiness

Conversations
  partial in 1.0

Tasks
  partial if current services support it cleanly

Decisions
  derived or placeholder in 1.0

Evidence
  partial in 1.0, with honest empty states when provenance is missing

Search
  outside the first vertical slice unless existing retrieval services make it cheap
```

---

## Sequencing

```text
S1 Web Surface Foundation
  └── S2 Perspective Shell and Preference
        └── S3 Identity Map Page
              └── S4 Object Detail and Source Context
                    ├── S5 Workspace Dashboard Slice
                    └── S6 Personal Mirror Validation
```

S1 and S2 establish the technical and interaction frame. S3 and S4 prove the
Identity vertical slice. S5 adds the first Workspace read model after the
surface pattern exists. S6 validates the release surface against the real
personal Mirror and may produce follow-up stories.

---

## Done Condition

CV9.E6 is done when:

- the web layer consumes typed surface read models instead of querying SQLite or
  composing domain meaning inline;
- the user can choose a default perspective and switch perspectives from a
  stable shell;
- the default perspective is stored in the user home;
- Atlas shows a read-only psyche map with real identity and persona data;
- supported objects open into a common detail view;
- source context exists for supported objects and is honest when deeper
  provenance is missing;
- Workspace shows a first useful read-only operational dashboard;
- automated tests cover surface composition independently from HTTP transport;
- manual validation on the personal Mirror demonstrates that a user can
  understand what exists inside the Mirror without reading the database or using
  CLI commands;
- docs, roadmap, decisions, and worklog reflect the shipped behavior.

---

## Validation Route

Each story must include its own `test-guide.md`. At the epic level, the final
manual validation should verify:

```text
Can I open the local web app?
Can I choose and persist a default perspective?
Can I switch between Atlas and Workspace?
Can I see my identity?
Can I see my personas?
Can I understand the Atlas map?
Can I open a supported object detail?
Can I see where a supported object comes from and whether deeper provenance exists?
Can I understand which areas are partial or not supported yet?
```

---

## See also

- [Mirror Web Perspectives](../../../../product/envisioning/web-perspectives.md)
- [Web Surface Specification](../../../../product/specs/web-surface/index.md)
- [Architecture](../../../../product/architecture.md)
- [Decisions](../../../decisions.md)
