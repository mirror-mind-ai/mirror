[< CV20](../index.md)

# CV20.DS9 — Method Preferences And Overrides

**Status:** 🟡 Planned
**Type:** Delivery Story

---

## Outcome

Builder can resolve Ariad method defaults, project-local configuration, and Navigator preference overrides into an inspectable effective method policy that governs commit, push, checkpoint, validation, documentation, and release behavior without requiring those rules to live only in prose.

---

## Context

Ariad already distinguishes method invariants from Navigator/project preferences in `/Users/alissonvale/Code/ariad/docs/method/contracts-and-preferences.md`. Mirror Builder now has a method DSL, runtime adoption state, delivery cursor, lifecycle contracts, and deterministic surfaces, but preference behavior still mostly lives in `AGENTS.md`, skill prose, and project development guides.

The next structural step is to make preferences first-class method data:

```text
canonical Ariad defaults
  -> project-local Ariad config
  -> Navigator/session override
  -> effective method preferences
```

This keeps Ariad opinionated but not rigid, lets projects override behavior without forking skill docs, and allows Builder to explain which policy source controls the current action.

---

## Scope

- Define a typed preference model in the Builder method DSL.
- Add canonical Ariad default preferences for at least:
  - commit policy;
  - push policy;
  - checkpoint compression policy;
  - validation policy;
  - documentation/worklog policy.
- Define project-local override file shape, likely `.ariad/config.yml`.
- Resolve overrides into an inspectable effective preference set.
- Add CLI/runtime inspection for effective preferences.
- Apply effective preferences to at least commit guidance, push/release boundaries, and validation acceptance behavior.
- Preserve current base Builder behavior for journeys that have not adopted Ariad.

---

## Out Of Scope

- Supporting arbitrary third-party methods beyond the current method definition extension points.
- Building a remote method marketplace.
- Fully implementing release automation.
- Persisting every preference as mutable UI state before the file-based override model is proven.

---

## Acceptance Behavior

```text
Given a journey has adopted Ariad
And no project-local preference override exists
When Builder inspects effective preferences
Then Builder shows canonical Ariad defaults
And names Ariad as the source of each default
```

```text
Given a journey has adopted Ariad
And `.ariad/config.yml` overrides commit policy
When Builder inspects effective preferences
Then Builder shows the overridden commit policy
And names the project config file as the source
And leaves unrelated preferences at canonical defaults
```

```text
Given effective preferences require committing after each validated codebase change
When Builder completes a validated change
Then Builder proposes or performs the history action according to that policy
And stages only story-scoped files
And does not use `git add .`
```

```text
Given effective preferences require explicit Navigator validation acceptance
When Builder renders Validation with only a Navigator route
Then Validation remains pending
And Builder does not advance to Debt Review, Coherence, or Done
```

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV20.DS9.TS1 | Preference DSL Model | Technical Story | Builder method definitions can declare typed preferences and source metadata | 🟡 Planned |
| CV20.DS9.TS2 | Project Override Loader | Technical Story | Builder reads `.ariad/config.yml` and merges it with canonical method defaults | 🟡 Planned |
| CV20.DS9.US1 | Inspect Effective Preferences | User Story | Navigator can ask Builder which preferences are active and where they came from | 🟡 Planned |
| CV20.DS9.US2 | Commit Policy Enforcement | User Story | Builder follows the effective commit policy after validated changes | 🟡 Planned |

---

## Validation

- Unit tests for preference schema validation and merge precedence.
- CLI tests for effective preference inspection with and without overrides.
- Pi/Mirror natural-language validation against `sandbox-pet-store`.
- Regression check that non-Ariad journeys keep current Builder behavior.
