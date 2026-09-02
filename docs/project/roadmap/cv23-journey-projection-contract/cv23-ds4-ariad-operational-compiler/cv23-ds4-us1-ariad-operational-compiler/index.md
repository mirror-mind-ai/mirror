[< Parent](../index.md)

# CV23.DS4.US1 — Rebuild a Deterministic Ariad Operational Projection

**Status:** ✅ Done
**Type:** User Story

---

## User Story

As a local read-only consumer,
I want Ariad's durable Journey state compiled into one deterministic Operational
projection,
So that I can understand current work without reading private source bodies or
gaining mutation authority.

## Outcome

Roadmap hierarchy, active work, Exploratory Stories, Refinement Stories, Change
Requests, and public artifact references compile into a schema-valid
`ariad:operational` document and publish through DS2.

## Acceptance Behavior

```text
Given a registered synthetic Journey with represented durable Ariad sources
When the Operational projection is rebuilt with fixed test values
Then its canonical document matches the normative contract fixture exactly
And source identity is deterministic over only represented public state

Given a durable source is unsafe or structurally ambiguous
When rebuild is requested
Then compilation fails before publication with bounded diagnostics
And previous consumer authority remains unchanged
```

## Scope

- Pure deterministic Operational compiler.
- Ordered roadmap grammar normalization.
- Explicit active-work projection.
- Public exploration/refinement extraction.
- Canonical represented-state source revision.
- Registered-root compilation and DS2 publication.

## Out Of Scope

- Sibling Delivery Story scope.

## Validation

Driver-owned contract golden, native grammar, privacy, malformed-source,
determinism, publication, full regression, and unchanged external-kit checks.
Navigator delegated validation and will not perform a separate review.
