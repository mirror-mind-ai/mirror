[< Story](index.md)

# Plan — CV9.E6.S2 Perspective Shell and Preference

## Goal

Create the first shared web visibility shell for Atlas and Workspace without
building the full perspective content yet. The shell should make the active
perspective visible, allow switching, store the default in the user's Mirror
home, and keep the existing docs browser reachable.

## Scope

- Add a small web preference module that reads/writes the default perspective in
  the user home.
- Expose HTTP API routes for:
  - reading current shell state and default perspective;
  - setting the default perspective;
  - reading Atlas and Workspace surface home DTOs.
- Update the static web shell to include:
  - Mirror header / identity label;
  - perspective chooser when no default exists;
  - perspective switcher when a perspective is active;
  - global search affordance as a visible disabled/placeholder control;
  - docs browser access as a dedicated Docs mode or panel.
- Render skeletal Atlas and Workspace content from `mem.surfaces`, using honest
  empty states from the surface layer.
- Add unit tests for preference persistence and server API behavior.

## Design

### Preference storage

Store web preferences under the Mirror home, not browser storage. The first file
shape should be intentionally small and stable:

```text
<mirror-home>/web/preferences.json
```

Initial content:

```json
{
  "default_perspective": "atlas"
}
```

Valid perspectives are `atlas` and `workspace`. Missing file means no default
has been chosen. Invalid or unreadable data should not crash page rendering;
API responses should include an honest warning and return `defaultPerspective:
null`.

### Server integration

The web server should accept an optional `mirror_home`/db path path through the
existing `serve()` construction path and create a `MemoryClient` only for API
requests that need surface data. Route handlers should remain thin:

```text
web routes -> MemoryClient.surfaces -> services -> storage -> db
```

Candidate API routes:

```text
GET  /api/shell
POST /api/preferences/default-perspective
GET  /api/surface/atlas
GET  /api/surface/workspace
```

The web layer may serialize DTOs with `to_dict()`, but should not compose Atlas
or Workspace meaning inline.

### Static shell

Keep the current local app simple and dependency-free. Replace the docs-first
layout with a shell that can show:

- a top header with Mirror identity, active perspective, and search placeholder;
- a perspective switcher with Atlas / Workspace / Docs;
- a first-run chooser if no user-home default exists;
- a content region for selected perspective;
- the current docs browser available through Docs.

Browser local state may track the current tab for navigation convenience, but
it must not be the source of truth for the default perspective.

## Out of Scope

- Full Atlas spatial/editorial design.
- Full Workspace dashboard design.
- Object detail routing.
- Functional search.
- Editing any Mirror data.
- LLM synthesis during page rendering.
- Authentication or remote serving.

## Risks

- The current web server is minimal and does not yet carry Mirror home/db state;
  thread-safe per-request client construction should stay simple.
- The API must remain read-only except for the local preference file.
- The docs browser must not disappear, because it is still useful during the
  transition from docs console to visibility surface.

## Implementation Steps

1. Add web preference model/service with tests.
2. Add server API routes for shell state, preference write, and surface DTOs.
3. Update static HTML/CSS/JS to render the shared shell and perspective switcher.
4. Keep Docs mode functional through existing docs APIs.
5. Run focused web/surface tests and lint/format checks.
