[< Story](index.md)

# Plan — CV9.E6.S5 Workspace Dashboard Slice

## Intent

Make Workspace the operational counterpart to the Identity Map. Where Identity
reveals meaning, Workspace should coordinate movement through the user's active
journeys.

The first slice should become **journey-centric**: a scrollable journey menu on
the left, a selected journey profile in the center, and tabs for overview,
conversations, tasks, and related context. It should stay read-only and use
existing service readiness. It should not become a generic project-management
clone or a database admin page.

## Product shape

Public frame:

```text
Workspace
Operational dashboard
Where work, decisions, tasks, and recent context are moving.
```

Suggested dashboard rhythm:

```text
Workspace
How Mirror can help you today
Where you find your work, projects, decisions and daily tasks.

┌───────────────┬──────────────────────────────────────────────┐
│ Journeys      │ Selected journey profile                     │
│               │ ┌──────────────────────────────────────────┐ │
│ Mirror Mind   │ │ accent banner                            │ │
│ Maestro       │ │ ◇ Mirror Mind                     active │ │
│ Sandbox       │ │ Mirror Mind 1.0 web visibility           │ │
│ ...           │ │ tasks · conversations · memories         │ │
│               │ └──────────────────────────────────────────┘ │
│               │                                              │
│               │ Overview | Conversations | Tasks | Memories  │
│               │                                              │
│               │ tab content                                  │
└───────────────┴──────────────────────────────────────────────┘
```

The page should be denser and more analytical than Identity:

- journeys appear as a compact left menu, not cards;
- selected journey gets a profile-style header;
- tabs organize operational context without a long vertical stack;
- counts and statuses appear where useful;
- empty states remain clear and honest.

## Implementation steps

1. Tighten the `WorkspaceHome` read model around selected journey state:
   - journey list;
   - selected journey id;
   - selected journey profile;
   - tab sections for overview, conversations, tasks, memories, and decisions.
2. Refine `WorkspaceSurface.home()` so it chooses a default selected journey:
   - prefer the most recent conversation with a journey;
   - otherwise use the first active journey;
   - otherwise show an honest empty state.
3. Build selected journey context from existing services:
   - active journeys from `JourneyService.list_active_journeys()`;
   - open tasks filtered by journey;
   - recent conversations filtered by journey;
   - recent memories filtered by journey;
   - decision memories filtered by journey.
4. Update the Workspace UI renderer to use a journey-centric layout:
   - scrollable journey sidebar;
   - profile-style selected journey header;
   - client-side tabs for Overview, Conversations, Tasks, Memories, Decisions.
5. Keep object-detail integration conservative:
   - supported kinds can use the shared object detail route;
   - unsupported kinds should remain visually present but not imply detail
     support until their object detail exists.
6. Update tests for populated, selected, and empty Workspace states.
7. Restart the local web server after web module changes and manually validate
   against the personal Mirror.

## Boundaries

- No editing workflows.
- No live LLM synthesis.
- No route-level SQL or route-level domain composition.
- No fake project-management semantics.
- Do not claim first-class decision support unless it is backed by existing
  memory/service data.

## Review questions

- Does Workspace feel like “where are we and what moves next?”
- Is it clearly different from Identity while still using the same shell/design
  language?
- Are partial/unsupported areas honest?
- Does the dashboard help a user understand current Mirror activity without CLI
  commands?
