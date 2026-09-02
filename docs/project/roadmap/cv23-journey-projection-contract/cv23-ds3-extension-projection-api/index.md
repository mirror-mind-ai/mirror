[< Parent](../index.md)

# CV23.DS3 — Extension Projection API

**Status:** ✅ Done
**Type:** Delivery Story

---

## Outcome

Every command-skill extension receives a stable `api.journey_projections`
façade bound permanently to `api.extension_id`. It publishes and inspects only
that extension's Tactical or Strategic projections through the DS2 kernel,
with optional offline schema validation and no filesystem authority.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV23.DS3.US1](cv23-ds3-us1-extension-projection-api/index.md) | Publish and inspect extension-owned projections | User Story | An installed extension can safely publish and inspect only its bound namespace through the public API | ✅ Done |

## Done Condition

- `ExtensionAPI.journey_projections` implements the contract's stable publish
  and inspect operations.
- Journey, projection, namespace, producer kind, and producer ID authority are
  checked before publication.
- `ariad` remains Core-only and cross-extension access is impossible through
  the façade.
- Optional extension-owned JSON Schema validates offline before mutation.
- The façade delegates to DS2's registered-root, locking, receipt, publication,
  rollback, and inspection owners without a second write path.
- Extension API version `1.1` is the single documented and discoverable
  authority.
- Focused and regression tests use only synthetic roots and databases.

## Planning Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
