[< CV20.DS4](../index.md)

# CV20.DS4.TS3 — Deterministic Ariad Surface Delivery

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Ariad runtime surfaces are emitted as deterministic transport artifacts so the agent returns runtime output instead of probabilistically summarizing or translating it.

---

## Scope

- Add explicit begin/end surface boundaries for Ariad runtime surfaces.
- Wrap roadmap snapshot, pull candidates, Builder resume, Pull, Prepare, and Plan surfaces.
- Update focused tests to assert boundary markers.
- Update Builder skill instructions to treat wrapped surfaces as verbatim stdout transport.

---

## Validation

Automated validation covers lifecycle renderers, pull candidate renderers, resume surface rendering, CLI behavior, cursor behavior, and method adoption behavior.
