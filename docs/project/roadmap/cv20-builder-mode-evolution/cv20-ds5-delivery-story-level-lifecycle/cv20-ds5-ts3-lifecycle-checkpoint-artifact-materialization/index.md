[< Parent](../index.md)

# CV20.DS5.TS3 — Lifecycle Checkpoint Artifact Materialization

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Runtime materializes lifecycle checkpoint artifacts at canonical story package paths for Delivery Story, User Story, and Technical Story lifecycle units.

## Technical Story Statement

In order to preserve Ariad lifecycle traceability,
As Builder runtime,
I want Validation, Debt Review, Coherence, and Done checkpoints to create artifacts at canonical package paths,
So that DS-level and child-story lifecycle evidence is inspectable without manual file moves or worklog-only closure.

## Acceptance Behavior

```text
Given an active lifecycle unit has a canonical story package
When Builder renders Validation, Debt Review, Coherence, or Done
Then the corresponding artifact is materialized inside that canonical package
And the artifact path reported by the runtime points to that file
```

```text
Given a Delivery Story is closed through aggregate DS flow
When Builder records DS-level Validation, Review, Coherence, and Done
Then DS-level checkpoint artifacts exist in the Delivery Story package
And child work packages remain visible as evidence units
```

```text
Given a User Story or Technical Story is closed through story-by-story flow
When Builder records lifecycle checkpoints
Then validation.md, review.md, coherence.md, and done.md are materialized in that story package
```

## Scope

- Define canonical package path resolution for DS, US, and TS lifecycle units.
- Materialize `validation.md`, `review.md`, `coherence.md`, and `done.md` at checkpoint time.
- Document why `implement.md` is not created as a canonical artifact by default.
- Reuse existing generated content where possible.
- Prevent artifact creation in synthetic fallback paths when a canonical CV/DS package exists.
- Add focused tests for DS-level and child-story artifact paths.

## Out Of Scope

- Changing the lifecycle semantics of Validation, Debt Review, Coherence, or Done.
- Implementing release intent/push/release behavior from `CV20.DS7`.
- Implementing DS8 preferences/config overrides.
- Rewriting historical artifact packages unless touched by active work.
- Creating `implement.md` as a canonical artifact by default; implementation evidence remains in diffs, changed files, tests, validation, and history.

## Validation

- Unit tests for canonical package path resolution and artifact materialization.
- Focused CLI/runtime tests for Validation/Review/Coherence/Done artifact paths.
- Sandbox inspection confirms DS-level closure produces checkpoint artifacts under the DS package.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
