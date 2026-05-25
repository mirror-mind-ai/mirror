[< CV9.E6 Web Visibility](../index.md)

# CV9.E6.S4 — Object Detail and Source Context

**Status:** ✅ Done
**User-visible outcome:** Supported objects open into a common detail view with related objects, metadata, rendered content, and clear source context.

## Scope

Create the shared object detail grammar used by Identity and Workspace:

- title;
- description;
- kind and id;
- relationships;
- source context;
- metadata;
- honest missing-provenance state.

## Acceptance Criteria

- Identity and persona objects have supported detail views.
- The same detail grammar can be reused by future memory, journey, conversation,
  task, and decision details.
- Source context is shown for supported objects, including an honest state when deeper provenance is unavailable.
- The detail route uses surface DTOs rather than route-level composition.

## Plan and Validation

- [Plan](plan.md)
- [Test Guide](test-guide.md)

## Implementation Summary

S4 added the shared object detail route and UI drill-down for supported Identity
Map objects. Self, Ego, Shadow, and personas now open from the Identity Map into
a read-only detail page with summary, rendered Markdown-like content, **Source**
context, **Related** links, and metadata.

The public story language changed from evidence affordance to **Source Context**
because users need to know where an object comes from before they need technical
provenance vocabulary. Identity and persona details now state their explicit
source path, such as `identity/self/soul` or `persona/engineer`, and avoid
claiming inference from memories. Shadow can open as an honest placeholder when
no explicit shadow identity entry exists.

Validation passed with focused surface/web/public API tests, Ruff checks, JS
syntax check, and manual browser review.

## Notes

This story avoids claiming full provenance coverage. It establishes the detail
and source affordance so future memory, journey, conversation, task, and decision
details can add richer provenance later.
