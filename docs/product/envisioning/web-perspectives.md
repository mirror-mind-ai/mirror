[< Envisioning](index.md)

> **Status: Exploratory product design.** This document captures the first
> product exploration for the Mirror Mind 1.0 web visibility surface. It is not
> yet a roadmap or implementation spec. It should be iterated until the team can
> derive concrete epics and stories.

# Mirror Web Perspectives

Mirror Mind 1.0 needs a web surface that makes the user's Mirror visible. The
surface should not feel like a database admin panel. It should help the user
stand in front of their Mirror with a chosen way of looking.

The current product direction is to model the web experience through
**perspectives**. A perspective is not a permanent user type. It is a viewing
mode over the same underlying Mirror data. Atlas and Workspace share Mirror
Core, but they do not need to share the same information architecture or visual
rhythm.

```text
same Mirror data
  identity
  personas
  journeys
  memories
  conversations
  tasks
  decisions

seen through different perspectives
  Atlas
  Workspace
```

The Mirror does not change when the perspective changes. The user's stance in
front of the Mirror changes.

## Product premise

Mirror Mind has at least two natural usage patterns:

- Some users approach Mirror as identity-first: identity, self-knowledge,
  personas, memory, recurring patterns, and long-term becoming are the primary
  value.
- Other users approach Mirror as work-first: journeys, projects, operational
  context, decisions, tasks, and continuity are the primary value.

The product should not split these into two separate products or force a user to
choose a fixed identity. The same person may need a reflective view in one
moment and an operational view in another.

The web surface should therefore ask a situational question:

```text
How do you want to look at your Mirror?
```

For Mirror Mind 1.0, the initial perspectives are:

```text
Atlas
  Explore identity, personas, memories, patterns, and conversations as a map of
  meaning.

Workspace
  Follow journeys, decisions, tasks, conversations, and useful context as a
  surface for action.
```

## Perspective behavior

If a user has not chosen a default perspective yet, the web app asks which
perspective they want to use. The choice can be saved as the default, but the
user can always switch perspectives later.

```text
Welcome to your Mirror

Choose how you want to look today.

┌─────────────────────────────┐   ┌─────────────────────────────┐
│ Atlas                       │   │ Workspace                   │
│                             │   │                             │
│ Explore identity, personas, │   │ Follow journeys, decisions, │
│ memories, and patterns.     │   │ tasks, and conversations.   │
│                             │   │                             │
│ [Enter Atlas]               │   │ [Enter Workspace]           │
└─────────────────────────────┘   └─────────────────────────────┘

[ ] Use this as my default perspective
```

Once inside the app, the active perspective remains visible and switchable.
The shell stays stable while the inner surface changes.

```text
┌──────────────────────────────────────────────────────────────┐
│ Mirror Mind        Perspective: Atlas ▾       Search Mirror  │
└──────────────────────────────────────────────────────────────┘

Atlas content
  editorial psyche map

Workspace content
  analytical work dashboard
```

The common shell prevents the product from feeling like two unrelated apps. The
perspective controls the rhythm of the surface, not the existence of the Mirror.
Implementation should follow the [Web Surface Specification](../specs/web-surface/index.md):
web routes render typed surface read models instead of querying internal data
or composing meaning directly.

## Atlas perspective

Atlas treats Mirror as a map of meaning. It is for understanding what the Mirror
knows, how identity is structured, which personas are active, which memories
matter, and which patterns keep returning.

Atlas should feel editorial, spatial, and contemplative. Its primary
information architecture is a psyche map, not a sidebar. The user enters through
regions of meaning rather than through a list of administrative sections.

Primary question:

```text
What does my Mirror know about me, and where did that understanding come from?
```

Atlas map regions:

```text
Self / Identity
  structural layers that shape how the Mirror responds

Ego
  the active operational voice

Personas
  specialized lenses that activate by context

Memories
  retained meaning, facts, patterns, and evidence

Shadow
  tensions, avoidances, contradictions, and integration candidates

Journeys
  fields of becoming and work

Conversations
  raw trail from which memory, decisions, and patterns emerge
```

Atlas home wireframe:

```text
┌──────────────────────────────────────────────────────────────┐
│ Atlas                                      Search your Mirror │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                         ┌────────────┐                       │
│                         │   Self     │                       │
│                         │ principles │                       │
│                         └─────┬──────┘                       │
│                               │                              │
│        ┌────────────┐   ┌─────▼──────┐   ┌────────────┐      │
│        │ Personas   │◄──┤    Ego     ├──►│  Journeys  │      │
│        │ lenses     │   │ voice      │   │ fields     │      │
│        └────────────┘   └─────┬──────┘   └────────────┘      │
│                               │                              │
│        ┌────────────┐   ┌─────▼──────┐   ┌────────────┐      │
│        │ Shadow     │◄──┤ Memories   ├──►│Conversations│     │
│        │ tensions   │   │ meaning    │   │ raw trail  │      │
│        └────────────┘   └────────────┘   └────────────┘      │
│                                                              │
│  How your Mirror sees you today                              │
│  Short editorial synthesis with links to evidence.           │
└──────────────────────────────────────────────────────────────┘
```

Example object interpretation:

```text
Memory in Atlas
  What this reveals about me
  Related identity layer
  Related personas
  Evidence conversations
  Confidence and provenance
```

## Workspace perspective

Workspace treats Mirror as a surface for action. It is for understanding current
journeys, decisions, tasks, project context, and the conversation trail that led
to the current state.

Workspace should feel analytical, operational, and state-oriented. Its primary
information architecture is a dashboard. It should expose movement, blockers,
recent decisions, active work, and relevant context without becoming a generic
project-management clone.

Primary question:

```text
Where are we, what has been decided, and what should move next?
```

Workspace dashboard areas:

```text
Active journeys
  what is currently moving

Decisions
  what has been decided and why

Tasks
  concrete open work when tasks exist

Recent conversations
  operational trail that shaped the current state

Relevant memories
  reusable context for the active work

Context
  identity and persona material that affects how work should be interpreted
```

Workspace home wireframe:

```text
┌──────────────────────────────────────────────────────────────┐
│ Workspace                                  Search your Mirror │
├──────────────────────────────────────────────────────────────┤
│ Active journeys                                             │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Mirror Mind 1.0                                          │ │
│ │ Stage: web visibility discovery                          │ │
│ │ Next: document perspectives and derive roadmap           │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────┐ ┌──────────────────────┐           │
│ │ Recent decisions     │ │ Open tasks           │           │
│ │ 3 this week          │ │ 7 active             │           │
│ └──────────────────────┘ └──────────────────────┘           │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Recent conversations by journey                          │ │
│ │ Conversation trails that shaped the current work          │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Example object interpretation:

```text
Memory in Workspace
  Why this matters to the current journey
  Related decisions
  Related tasks
  Related conversations
  Last used or referenced
```

## Shared object model

Perspectives should not duplicate data. They should change the presentation and
priority of the same objects. The product has one Mirror Core and two rhythms:
Atlas reveals meaning; Workspace coordinates movement.

```text
Persona
  Atlas: an internal lens of identity
  Workspace: a specialized operating mode

Memory
  Atlas: evidence of a pattern or identity claim
  Workspace: reusable context for action

Conversation
  Atlas: evidence and autobiographical material
  Workspace: decision trail and operational history

Journey
  Atlas: a transformation path
  Workspace: a project or active field of work
```

This keeps the product coherent: identity remains the foundation, but identity
is not forced as the only front door.

## Unity of experience

Atlas and Workspace should be fundamentally different in information
architecture and surface rhythm, but they should not feel like separate
products. Unity comes from shared structure beneath the visible differences.

Shared elements:

```text
Shell
  Mirror identity, perspective switcher, global search, local-first status,
  settings, and account/runtime affordances remain stable.

Object model
  Identity, personas, memories, journeys, conversations, tasks, and decisions
  are the same entities in both perspectives.

Detail grammar
  Clicking any object opens a familiar detail structure: title, description,
  relationships, evidence, and available actions.

Evidence pattern
  Interpretive claims remain traceable through the same "View evidence"
  affordance.

Design system
  Typography, spacing scale, card anatomy, radius, focus states, badges, and
  icons remain shared.
```

Perspective-specific variation:

```text
Atlas
  more spacious
  more editorial
  map-based IA
  larger regions
  fewer numbers
  deeper colors and symbolic accents

Workspace
  denser
  more analytical
  dashboard-based IA
  lists, tables, filters, and status cards
  more counts and operational state
  clearer neutral surfaces with pragmatic accents
```

The technical counterpart to this design unity is the surface layer: Atlas and
Workspace are separate read models over the same Mirror Core, not separate data
models. The web layer consumes those read models through the Web Surface API.

The design principle is:

```text
One Mirror, two rhythms.
Atlas reveals meaning.
Workspace coordinates movement.
```

## Evidence principle

Every interpretive claim should be traceable. When the interface says that a
memory, pattern, persona, or journey means something, the user should be able to
inspect the evidence behind it.

Initial evidence affordances:

```text
View evidence
  conversations
  source memories
  related journey events
  created or updated timestamps
  confidence or status when available
```

Evidence is not a separate 1.0 perspective yet. It is a detail pattern used by
both Atlas and Workspace.

## 1.0 scope

The 1.0 web visibility slice should stay small enough to ship, while still
proving the perspective model and the Web Surface architecture.

The first implementation should be a vertical slice, not a broad horizontal
inventory. The preferred first slice is:

```text
Perspective shell
  first-run perspective choice
  persistent default perspective in the user home
  perspective switcher
  global search affordance, even if search itself is deferred

Atlas vertical slice
  editorial psyche map
  Identity region with real data
  Personas region with real data
  Object detail for supported identity/persona objects
  Evidence placeholder or real provenance where available
```

This slice proves the full path:

```text
web shell -> Atlas surface -> services -> storage -> rendered object detail
```

Workspace should follow once the shell and surface pattern are proven. Its first
version should reuse the same shell and surface DTO grammar while presenting an
analytical dashboard.

## 1.0 data coverage matrix

The first roadmap should classify each area honestly instead of pretending every
Mirror object is equally ready.

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
  partial if current data services support it cleanly

Decisions
  derived or placeholder in 1.0

Evidence
  partial in 1.0, with honest empty states when provenance is missing

Search
  out of the first vertical slice unless it falls out cheaply from existing
  retrieval services
```

## 1.0 boundaries

The 1.0 web visibility surface is read-only. It should let the user see what is
inside the Mirror before offering mutation workflows.

In scope:

- First-run perspective choice when no default exists.
- Persistent default perspective setting stored in the user home.
- Perspective switcher in the web shell.
- Atlas home as an editorial psyche map.
- Workspace home as an analytical dashboard after the first Atlas slice proves
  the architecture.
- Object detail pages for supported objects.
- Evidence affordances where source data exists.
- Honest empty states where data or provenance is not available yet.

Out of scope for the first slice:

- Editing identity or memory content.
- Force-directed or fully interactive graph navigation.
- Automated perspective inference.
- Full evidence graph.
- Live LLM synthesis during page rendering.
- Multi-user web authentication beyond the current local-first boundary.

## 1.0 success criterion

The web visibility release succeeds when a user can open the local web app and
understand what exists inside their Mirror without reading the database or using
CLI commands.

Manual validation questions:

```text
Can I see my identity?
Can I see my personas?
Can I understand the Atlas map?
Can I open a supported object detail?
Can I see whether evidence exists for a claim?
Can I switch perspective without feeling like I changed products?
Can I understand which areas are not fully supported yet?
```

## Remaining open questions

- Should perspective affect URLs, for example `/atlas/memories` and
  `/workspace/memories`, or should it be a query or session state over shared
  routes?
- Which objects already have enough provenance to support useful evidence links
  in 1.0?
- Should Atlas have any persistent secondary navigation, or should navigation
  happen primarily through the psyche map plus search?
- Which Workspace dashboard areas are supported by current data strongly enough
  to ship in 1.0?
