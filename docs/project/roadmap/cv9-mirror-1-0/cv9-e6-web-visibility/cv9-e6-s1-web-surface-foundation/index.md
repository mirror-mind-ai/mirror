[< CV9.E6 Web Visibility](../index.md)

# CV9.E6.S1 — Web Surface Foundation

**Status:** ✅ Done

**User-visible outcome:** The web app is backed by a sustainable Core Surface layer instead of ad hoc route-level data access.

## Scope

Establish the `src/memory/surfaces/` layer and typed DTOs described in the
[Web Surface Specification](../../../../../product/specs/web-surface/index.md).
The first implementation should provide enough read models to support the Atlas
vertical slice and later Workspace work without committing to all final UI data.

## Acceptance Criteria

- Web routes do not query SQLite or compose domain meaning directly.
- Surface modules can compose Atlas home, Workspace home, object detail, and
  evidence read models, even if some are skeletal.
- Surface DTOs are explicit and tested.
- Empty and partial data states are represented intentionally.
- Unit tests cover surface composition independently from HTTP transport.

## Plan and Validation

- [Plan](plan.md)
- [Test Guide](test-guide.md)

## Implementation Summary

S1 added the `memory.surfaces` package with explicit DTOs and read-model
composition for Atlas home, Workspace home, identity/persona object detail,
evidence bundles, and a stable skeletal search contract. `MemoryClient` now
exposes `mem.surfaces` so future web routes can consume surface read models
instead of reaching through to storage or composing domain meaning inline.

Validation passed with focused surface/web/public API tests and Ruff checks.
Manual contract review accepted the boundary for the next story.

## Notes

This story is architectural foundation. It stayed narrow and avoided building
full UI behavior before the surface boundary exists.
