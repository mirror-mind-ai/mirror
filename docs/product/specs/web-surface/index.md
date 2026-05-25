[< Specs](../index.md)

> **Status: Draft specification.** This document defines the intended
> architecture for the Mirror Mind web visibility surface. It should guide the
> 1.0 implementation, but method names may still change during story planning.

# Web Surface Specification

The Mirror Mind web app must remain a thin local interface over Mirror Core. It
should not query SQLite directly, reconstruct domain meaning inside route
handlers, or duplicate data composition between perspectives.

The core architectural rule:

```text
Web renders surfaces.
Surface composition shapes experience.
Services own domain retrieval.
Storage owns SQL.
```

## Layering

The web visibility stack has four layers:

```text
SQLite
  stores identity, memories, conversations, journeys, tasks, and runtime state

Storage / services
  retrieve domain data and enforce domain rules

Surface composition
  turns domain data into Atlas, Workspace, object detail, evidence, and search
  DTOs shaped for the web experience

Web layer
  exposes local routes, serves static assets, renders HTML, and serializes JSON
```

The web layer may depend on surface composition. Surface composition may depend
on services. Services may depend on storage. No dependency should point upward.

```text
web -> surfaces -> services -> storage -> db
```

## Responsibilities

### Web layer

The web layer owns transport and presentation mechanics only:

- local HTTP routes;
- static assets;
- HTML shell;
- JSON serialization;
- request parsing and response status codes;
- local-only safety boundaries.

The web layer must not:

- execute SQL;
- inspect raw schema details;
- perform identity, memory, journey, or conversation composition;
- decide how Atlas or Workspace interpret data;
- call an LLM while serving a page load.

### Services

Services own domain retrieval and domain behavior:

- identity layers and persona metadata;
- memories and memory search;
- journeys, tasks, and attachments;
- conversations and entries;
- consolidation and shadow state when relevant;
- runtime configuration and status when relevant.

Services may return domain objects or service DTOs. They should not know about
Atlas card layouts, Workspace dashboard sections, or web routes.

### Surface composition

Surface composition owns read models for human-facing web experience. It sits
between domain services and web routes.

Initial surface modules may be:

```text
src/memory/surfaces/
  atlas.py
  workspace.py
  objects.py
  evidence.py
  search.py
```

Surface composition is allowed to answer questions such as:

- which regions appear in Atlas;
- which dashboard sections appear in Workspace;
- which counts, labels, descriptions, and links appear on cards;
- which related objects are shown in a detail view;
- which source memories or conversations count as evidence;
- which empty states should be shown when data is missing.

Surface composition should be deterministic. Any LLM-generated synthesis should
come from already persisted data, not from a live LLM call during page rendering.

## Initial surface methods

The first implementation should keep the API small. Possible Python methods:

```python
atlas_home() -> AtlasHome
workspace_home() -> WorkspaceHome
object_detail(kind: str, id: str) -> ObjectDetail
evidence_for(kind: str, id: str) -> EvidenceBundle
search(query: str, perspective: str | None = None) -> SearchResults
```

Equivalent local HTTP routes may be:

```text
GET /api/surface/atlas
GET /api/surface/workspace
GET /api/surface/object?kind=<kind>&id=<id>
GET /api/surface/evidence?kind=<kind>&id=<id>
GET /api/surface/search?q=<query>&perspective=<atlas|workspace>
```

These names are provisional. The architectural contract matters more than the
exact route shape.

## DTO contract

Surface methods should return explicit typed DTOs, not unstructured dictionaries
assembled in route handlers.

Example DTOs:

```python
@dataclass(frozen=True)
class SurfaceLink:
    label: str
    href: str
    kind: str | None = None
    id: str | None = None


@dataclass(frozen=True)
class SurfaceCard:
    id: str
    kind: str
    title: str
    description: str
    href: str
    count: int | None = None
    status: str | None = None
    accent: str | None = None


@dataclass(frozen=True)
class AtlasRegion:
    id: str
    title: str
    description: str
    cards: tuple[SurfaceCard, ...]
    empty_state: str | None = None


@dataclass(frozen=True)
class AtlasHome:
    synthesis: str | None
    regions: tuple[AtlasRegion, ...]


@dataclass(frozen=True)
class WorkspaceSection:
    id: str
    title: str
    description: str | None
    cards: tuple[SurfaceCard, ...]
    empty_state: str | None = None


@dataclass(frozen=True)
class WorkspaceHome:
    status: str | None
    sections: tuple[WorkspaceSection, ...]
```

DTOs can evolve, but the principle should stay stable: surface methods return
what the interface needs, not how the database stores it.

## Perspective read models

Atlas and Workspace share the same underlying objects, but compose them
differently.

```text
Atlas
  editorial psyche map
  regions of meaning
  larger cards
  narrative synthesis
  evidence as provenance of interpretation

Workspace
  analytical dashboard
  operational sections
  denser cards, lists, tables, filters, and status
  evidence as provenance of decisions and state
```

The different perspectives should not create separate data models. They create
separate read models over the same Mirror Core.

## Object detail and evidence

Object detail is the unifying drill-down pattern. Any object reached from Atlas
or Workspace should resolve to a familiar structure:

```text
title
description
kind and id
relationships
evidence
actions when available
metadata
```

Evidence is a first-class surface concept. It may include:

- source conversations;
- source memories;
- related journey events;
- timestamps;
- readiness or confidence states when available;
- links back to the object that produced the claim.

Evidence should be honest about missing provenance. If the system cannot support
a claim with source data, the surface should say so rather than imply certainty.

## Search

Search should be a shared surface, not a per-perspective implementation detail.
A perspective may change ranking, grouping, labels, or result presentation, but
search should use the same underlying retrieval capabilities.

Initial behavior:

```text
query across visible Mirror objects
return typed results
include enough metadata to render in Atlas or Workspace
allow perspective-specific grouping later
```

## 1.0 implementation boundaries

The first web visibility release is read-only. It should make Mirror data
visible before it offers mutation workflows.

The default perspective is a Mirror preference and should be stored in the user
home, not only in browser-local state. Browser-local state may still be used for
transient UI state.

The first vertical slice should prove the whole path with a narrow Atlas scope:

```text
perspective shell
Atlas home surface
Identity region with real data
Personas region with real data
supported object detail
evidence placeholder or real provenance where available
```

Workspace should follow after this path is proven.

## Non-goals for the first web visibility slice

- Web routes querying SQLite directly.
- A fully interactive graph engine.
- Live LLM synthesis on page load.
- Editing identity, memories, or conversations.
- Remote web serving or multi-user web authentication.
- A separate Atlas database model or Workspace database model.

## Testing expectations

Surface composition should have unit tests independent from the HTTP server.
Tests should cover:

- Atlas home composition with populated and empty data;
- Workspace home composition with populated and empty data;
- object detail for each supported kind;
- evidence bundles when provenance exists and when it does not;
- route handlers delegating to surface methods rather than constructing read
  models inline.

The web server tests should remain small and verify transport behavior, static
asset serving, route status codes, and JSON serialization.
