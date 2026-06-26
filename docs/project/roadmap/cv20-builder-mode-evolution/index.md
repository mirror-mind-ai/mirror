[< Roadmap](../index.md)

# CV20 — Builder Mode Evolution

**Status:** 🟢 In Progress

**Exploration handoff:** [Ariad Builder DSL](../../explorations/ariad-builder-dsl/index.md)

---

## What This Is

CV20 evolves Builder Mode from a context-loading skill into a disciplined delivery environment governed by a declarative method DSL.

Ariad is the inaugural method, not the permanent architecture of Builder Mode. The runtime should load a method definition, resolve project and Navigator overrides, persist the operational delivery cursor, and render the current delivery moment without depending on the agent to infer process from prose.

---

## Product Boundary

Builder Mode Evolution does not make Mirror an autonomous project manager.

The Driver may recommend, prepare, implement, validate, review, and record according to the active method, but the Navigator keeps direction, approval, validation, debt decisions, release decisions, and policy overrides.

Ariad governs the first implementation. The architecture must remain open enough for other methods later.

---

## Delivery Arc

| Code | Delivery Story | Outcome | Status |
|------|----------------|---------|--------|
| [CV20.DS1](cv20-ds1-method-dsl-foundation/index.md) | Method DSL Foundation | Builder can load and validate Ariad as a declarative method definition, with taxonomy, lifecycle, checkpoints, policies, and surfaces represented as data | ✅ Done |
| [CV20.DS2](cv20-ds2-ariad-adoption/index.md) | Ariad Adoption | A journey can be configured to use Ariad, with documentation inventory, template generation, method config, and initial runtime sync | ✅ Done |
| [CV20.DS3](cv20-ds3-builder-resume-surface/index.md) | Builder Resume Surface | Builder load resumes an Ariad journey with briefing, roadmap position, active item, checkpoint, and allowed next actions | ✅ Done |
| [CV20.DS4](cv20-ds4-story-lifecycle-runtime/index.md) | Story Lifecycle Runtime | Builder can execute the Pull, Prepare, Plan, Implement, Validation, Review, Coherence, and Done lifecycle with deterministic checkpoint gates | ✅ Done |
| [CV20.DS5](cv20-ds5-delivery-story-level-lifecycle/index.md) | Delivery Story Level Lifecycle | Builder supports a Navigator-facing lifecycle at the Delivery Story level while preserving child story expansion, artifacts, and traceability | ✅ Done |
| [CV20.DS6](cv20-ds6-refinement-workbench-flow/index.md) | Refinement Workbench And Flow | Builder supports Ariad Refinement Work through Workbench, Refinement Stories, Change Requests, CR cycles, and RS-level review/coherence/close | ✅ Done |
| [CV20.DS7](cv20-ds7-release-push-policies/index.md) | Release And Push Policies | Builder distinguishes commit, push, and release, supporting planned and emergent release intent plus configurable push policies | 🟡 Planned |
| [CV20.DS8](cv20-ds8-debt-ledger-refactor-loop/index.md) | Debt Ledger And Refactor Loop | Review records technical debt in a versioned ledger, requires defer rationale and revisit trigger, and routes pay-now decisions through Refactor back to Validation | 🟡 Planned |
| [CV20.DS9](cv20-ds9-method-preferences-and-overrides/index.md) | Method Preferences And Overrides | Builder resolves Ariad defaults, project-local config, and Navigator overrides into inspectable effective preferences | 🟡 Planned |
| [CV20.DS10](cv20-ds10-builder-documentation-migration/index.md) | Builder Documentation And Migration | User-facing docs, process docs, and journey guidance explain Ariad Builder adoption, DSL overrides, lifecycle, and operational boundaries | 🟡 Planned |

---

## Flow Target

```text
Moment Zero: Adoption
  → configure journey for Ariad
  → check documentation and roadmap structure
  → generate templates where appropriate
  → sync method state into runtime

Moment One: Builder Home
  → load journey context
  → load effective method DSL
  → read roadmap and runtime cursor
  → read workbench and refinement cursor
  → render situated Delivery and Refinement fields

Delivery Lifecycle
  → Pull selects roadmap focus
  → Prepare reads terrain
  → Plan confirms route
  → Implement changes the system
  → Validation proves behavior
  → Preferences govern commit/push/checkpoint/validation behavior
  → Review names debt
  → Coherence integrates traces
  → Done records and closes

Refinement Lifecycle
  → Workbench holds Refinement Stories and Change Requests
  → Pull selects active Refinement Story
  → CR cycle confirms, plans, implements, validates, and records done notes
  → RS Review records patterns and debt candidates without direct mutation
  → RS Coherence checks workbench, docs, tests, roadmap, and product alignment
  → RS Close records CR outcomes and exits active refinement
```

---

## Conscious Non-Goals

- No general-purpose method marketplace.
- No implementation of additional delivery methods beyond Ariad in this CV.
- No operational-update lifecycle beyond the scoped Ariad Refinement Workbench path.
- No redesign of Ariad visual grammar before implementation pressure requires it.
- No silent state transitions without method checks.
- No autonomous Navigator decisions.
- No remote push or release publication without the effective policy allowing it.

---

## Done Condition

CV20 is done when a journey can adopt Ariad, Builder can resume that journey from persisted delivery and refinement state, the Ariad DSL governs Delivery and Refinement lifecycles through deterministic gates, the Navigator sees and confirms required checkpoints, effective method preferences are inspectable and respected, technical debt decisions are recorded durably, and commit, push, release, and override policies are visible and respected.

---

## References

- [Ariad Builder DSL handoff](../../explorations/ariad-builder-dsl/index.md)
- [Ariad Builder Method DSL](../../explorations/ariad-builder-dsl/method-dsl.md)
- [Development Guide](../../../process/development-guide.md)
