[< Story](index.md)

# Plan — CV9.E6.S1 Web Surface Foundation

## Intent

Create the core read-model layer that future web visibility screens will use.
This story should prove the architectural boundary, not build the full Atlas or
Workspace interface.

The value is sustainable code shape:

```text
web -> surfaces -> services -> storage -> db
```

After this story, the web layer can ask the core for Atlas, Workspace, object
detail, evidence, and search-shaped data without knowing SQL or reconstructing
Mirror meaning inside HTTP handlers.

## Current state

The current web console is a local read-only docs browser:

```text
src/memory/web/server.py
src/memory/web/docs.py
src/memory/web/static/*
```

`server.py` handles only docs routes today. It does not yet expose Mirror data
routes. The service layer already provides access to identity, journeys,
memories, conversations, and tasks through `MemoryClient` and focused services.
There is no `src/memory/surfaces/` package yet.

## Scope

Implement a first `memory.surfaces` package with explicit DTOs and deterministic
composition functions/classes.

Target modules:

```text
src/memory/surfaces/
  __init__.py
  models.py
  atlas.py
  workspace.py
  objects.py
  evidence.py
  search.py
```

Target tests:

```text
tests/unit/memory/surfaces/
  test_atlas.py
  test_workspace.py
  test_objects.py
  test_evidence.py
  test_search.py
```

The implementation should stay small and support future stories. It does not
need to expose HTTP endpoints yet unless a minimal route is needed to validate
the boundary.

## Design

### DTOs

Create frozen dataclasses for the first surface contract:

```python
SurfaceLink
SurfaceCard
AtlasRegion
AtlasHome
WorkspaceSection
WorkspaceHome
ObjectDetail
EvidenceItem
EvidenceBundle
SearchResultItem
SearchResults
```

Each DTO should expose a `to_dict()` method or use a small shared serializer so
future web JSON responses do not hand-roll nested conversion in every route.

### Atlas surface

`AtlasSurface` composes a skeletal Atlas home.

Minimum behavior for S1:

- returns an `AtlasHome`;
- includes regions for identity, personas, memories, shadow, journeys, and
  conversations;
- identity and persona regions use real service/store data when available;
- other regions may return honest empty or partial states;
- no LLM calls.

### Workspace surface

`WorkspaceSurface` composes a skeletal Workspace home.

Minimum behavior for S1:

- returns a `WorkspaceHome`;
- includes sections for active journeys, recent conversations, tasks, memories,
  and decisions/context;
- sections may be partial or empty;
- no route-level data access assumptions.

### Object detail surface

`ObjectDetailSurface` supports at least identity and persona objects because
S3/S4 depend on those.

Object ids should be stable and simple. Proposed convention:

```text
identity:<layer>:<key>
persona:<key>
```

The detail DTO should include title, description/content preview, kind, id,
relationships, metadata, and an evidence link or evidence state.

### Evidence surface

`EvidenceSurface` should establish the honesty contract. For S1, it can return
empty evidence bundles for objects that do not have provenance yet, as long as
the absence is explicit.

### Search surface

`SearchSurface` can be skeletal in S1. It should establish the contract and may
return an empty result set with a clear message until later stories wire real
search.

## Dependencies and boundaries

Allowed dependencies:

```text
surfaces -> services
surfaces -> models
surfaces -> small utility helpers
```

Avoid:

- importing `memory.web` from surfaces;
- route handlers composing surface read models inline;
- SQL in surfaces;
- live LLM calls in surfaces;
- adding editing/mutation workflows.

A surface may depend on `MemoryClient` or on individual services. Prefer a small
constructor that accepts services explicitly when practical, because it keeps
unit tests simple.

## Implementation steps

1. Add `src/memory/surfaces/models.py` with DTOs and serialization helpers.
2. Add skeletal surface modules for Atlas, Workspace, object detail, evidence,
   and search.
3. Wire surfaces into `MemoryClient` only if it keeps the public access cleaner,
   for example `client.surfaces.atlas_home()`. If this adds too much coupling,
   keep construction explicit and defer facade wiring.
4. Add unit tests for DTO serialization and each surface's basic composition.
5. Confirm the existing docs browser tests still pass.
6. Update docs only if implementation reveals a contract change from the spec.

## Risks

- **Overbuilding the read models.** S1 should establish shape, not finish every
  future surface.
- **Leaking database schema upward.** If a surface needs new domain retrieval,
  add or reuse a service method rather than writing SQL in the surface.
- **Unstable object ids.** Pick a simple convention now and document it in tests.
- **Premature web UI work.** UI belongs in later stories after this boundary is
  proven.

## Validation plan

Automated checks:

```bash
uv run pytest tests/unit/memory/surfaces tests/unit/memory/web
uv run --extra dev ruff check src/memory/surfaces tests/unit/memory/surfaces
uv run --extra dev ruff format --check src/memory/surfaces tests/unit/memory/surfaces
```

Manual validation for this story is documentation/code inspection rather than a
browser smoke, unless minimal HTTP routes are added. The Navigator should verify
that the new code shape matches the intended dependency direction and that no
web route owns surface composition.

## Done condition

S1 is done when:

- `src/memory/surfaces/` exists;
- surface DTOs are explicit and serializable;
- Atlas, Workspace, object detail, evidence, and search have initial deterministic
  surface modules;
- identity/persona data can be surfaced without web-layer composition;
- tests cover populated and empty cases for the implemented surfaces;
- no SQL or LLM calls are introduced in the web/surface boundary;
- the next story can build the perspective shell on top of the surface contract.
