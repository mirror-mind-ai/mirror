[< Story](index.md)

# Plan — CV13.E1.S1 Workspace-first shell cleanup

## Design

This story changes the read-only web entry rhythm without changing persistence, routes, or database access.

Implementation surfaces:

- `src/memory/web/preferences.py`
  - treat a missing or invalid stored preference as `workspace` by default;
  - keep explicit `atlas` and `workspace` values valid.
- `src/memory/web/static/index.html`
  - reorder tabs to Workspace, Identity, Docs;
  - remove the top-right active perspective badge.
- `src/memory/web/static/app.js`
  - default `activeView` to `workspace`;
  - stop writing the active perspective badge;
  - keep object detail/back behavior stable.
- `src/memory/surfaces/workspace.py`
  - remove task section and open-task metric;
  - remove task language from status/copy;
  - keep task service available only where current sorting still needs it, unless removal is simple and test-safe.

## Tests

Update focused tests:

- web preference tests should expect missing/invalid preference to resolve to Workspace;
- Workspace surface tests should assert no `tasks` section and no `open-tasks` metric;
- existing explicit `atlas` preference should still persist and read back.

## Risks

The main risk is accidentally turning this into the broader v1.1 refinement. Keep this story limited to entry default, shell cleanup, and task-noise removal. Memory pages, search pages, persona icon changes, chip pages, and conversation-card redesign remain future stories.
