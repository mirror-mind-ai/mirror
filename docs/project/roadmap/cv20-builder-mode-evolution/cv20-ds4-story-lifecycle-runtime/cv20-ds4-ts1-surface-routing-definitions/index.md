[< CV20.DS4](../index.md)

# CV20.DS4.TS1 — Surface Routing Definitions

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Ariad method data declares which surfaces are emitted for Builder events/intents, starting with roadmap inspection.

---

## Scope

- Add `SurfaceRoute` to the method definition DSL.
- Configure Ariad `show_roadmap` to emit `roadmap_snapshot` and `pull_candidates`.
- Render roadmap inspection using the configured route rather than only the Pull Candidates surface.
- Preserve read-only boundary for roadmap inspection.

---

## Validation

Automated validation confirms method route validation, Ariad route fixture, roadmap snapshot rendering, and CLI roadmap inspection behavior.
