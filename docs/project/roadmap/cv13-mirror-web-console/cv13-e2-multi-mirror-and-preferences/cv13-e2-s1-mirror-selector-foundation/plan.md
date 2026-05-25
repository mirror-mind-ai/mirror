[< Story](index.md)

# Plan — CV13.E2.S1 Mirror selector foundation

## Implementation plan

1. Create a small web-layer Mirror discovery model that lists sibling directories near the current Mirror home and marks the active one.
2. Expose discovered Mirrors through `/api/shell` and `/api/mirrors`.
3. Render a compact read-only Mirror selector foundation in the top bar.
4. Add focused tests for discovery, shell serialization, and the dedicated Mirrors endpoint.
5. Validate with focused pytest, ruff, JS syntax check, and browser review.

## Design boundaries

- Discovery is read-only.
- The current Mirror remains the only database used by the server.
- The UI does not pretend switching is available.
- Paths are discovered from local filesystem context, not submitted by the browser.
