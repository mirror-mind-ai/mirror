[< Story](index.md)

# Plan — CV9.E6.S4 Object Detail and Source Context

## Intent

Turn the Identity Map from a static overview into a navigable read-only surface:
supported objects should open into a shared detail view that shows content,
relationships, metadata, and a clear public **Source** affordance.

The technical contract may still include evidence/provenance internally, but the
user-facing concept is **Source Context**: where this object comes from and
whether deeper provenance exists.

## Product shape

Initial supported object details:

- `identity:self:soul` / `identity/<layer>:<key>` entries;
- `persona:<key>` entries.

Detail page grammar:

```text
Back to Identity Map

Summary
  icon / kind label / title / description / chips when available

Content
  readable object body

Source
  explicit origin path, e.g. identity/self/soul
  honest statement when no deeper provenance exists

Relationships
  related surface objects when known; honest partial state otherwise

Metadata
  kind, layer, key, timestamps/version when available
```

## Implementation steps

1. Tighten the surface DTOs so `ObjectDetail` can expose public source text and
   relationships without route-level composition.
2. Enrich identity/persona detail composition:
   - public labels for Self/Ego/Shadow/persona;
   - source path such as `identity/self/soul`;
   - explicit “not inferred from memories” state for identity/persona entries;
   - minimal relationships where useful.
3. Add an HTTP route for object detail, e.g.
   `GET /api/surface/object?kind=<kind>&id=<id>`.
4. Make Identity Map cards/tokens navigable to the shared detail view.
5. Render the detail view in the existing shell without introducing writes.
6. Preserve unsupported/missing object behavior with honest empty/error states.
7. Update tests and manual validation notes.

## Boundaries

- Do not build editing workflows.
- Do not claim full provenance coverage.
- Do not query SQLite from web routes.
- Do not introduce live LLM synthesis.
- Keep the internal route stable even if public copy says **Source Context** rather than evidence/provenance.

## Review questions

- Does “Source Context” explain origin better than “Evidence” for identity/persona?
- Does the detail view feel like a continuation of the Identity Map rather than
  an admin record page?
- Is missing provenance explicit without sounding broken?
