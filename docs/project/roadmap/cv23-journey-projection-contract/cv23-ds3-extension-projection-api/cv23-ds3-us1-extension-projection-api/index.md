[< Parent](../index.md)

# CV23.DS3.US1 — Publish and Inspect Extension-Owned Projections

**Status:** ✅ Done
**Type:** User Story

---

## User Story

As an installed extension author,
I want to publish and inspect Journey projections through a namespace-bound API,
So that my extension can share deterministic read models without gaining access
to Ariad authority or Mirror filesystem internals.

## Outcome

A bound extension publishes and inspects only its own Tactical or Strategic
projection using the same secure, linearizable kernel as Core publishers.

## Acceptance Behavior

```text
Given ExtensionAPI is bound to an installed extension ID
When the extension publishes a valid document for a registered Journey
Then namespace and producer identity are derived and enforced from that binding
And the document is published through the shared Journey projection kernel

Given the extension attempts Ariad or cross-extension access
When it publishes or inspects through journey_projections
Then the operation fails with a bounded namespace violation
And no projection, manifest, or receipt authority advances
```

## Scope

- Stable `journey_projections.publish` and `inspect` façade.
- Bound extension namespace and producer identity.
- Optional extension-owned JSON Schema validation.
- Registered Journey root resolution and DS2 kernel delegation.
- Additive Extension API version `1.1`.

## Out Of Scope

- Sibling Delivery Story scope.

## Validation

Synthetic unit and real-kernel integration tests prove binding, schema,
registered-root, publication, inspection, and failure behavior. Existing
Extension API behavior and the unchanged consumer contract kit remain green.
