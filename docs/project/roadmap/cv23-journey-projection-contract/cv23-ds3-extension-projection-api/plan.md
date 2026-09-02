# Delivery Story Plan — CV23.DS3

**Journey:** mirror-mind-development
**Method:** ariad
**Navigator Flow Unit:** delivery_story
**Status:** Proposed
**Contract:** `mirror.journey-projections@1.0`
**Extension API target:** `1.1`

## Delivery Story

Extension Projection API

## Objective

Deliver one stable `ExtensionAPI.journey_projections` façade permanently bound
to `extension_id`. Extensions publish and inspect only their own Tactical or
Strategic Journey projections through the DS2 kernel, with optional offline
schema validation and no Journey, filesystem, Builder, or storage internals.

## Child Work Packages

- CV23.DS3.US1 — Publish and inspect extension-owned projections

## Scope

1. Add the stable operations
   `publish(journey_id, projection_id, document, schema=None)` and
   `inspect(journey_id, projection_id)`.
2. Bind namespace and producer identity at `ExtensionAPI` construction. The
   caller cannot supply or override the target namespace.
3. Require the document's `journeyId`, `projection`, `namespace`,
   `producer.kind`, and `producer.id` to match the call and bound extension.
   Reserve `ariad` for Core even if an extension is named `ariad`.
4. Validate the shared extension schema and optional extension-owned JSON
   Schema 2020-12 against the complete document before publication.
5. Delegate publication and inspection to the single
   `JourneyProjectionService`; add no extension filesystem or lock path.
6. Resolve Journey roots lazily from registered Journey metadata through the
   Extension API's SQLite connection. Callers never supply a root.
7. Preserve source compatibility and an injectable service seam for Core tests
   and loaders.
8. Bump the additive Extension API version from `1.0` to `1.1`; capability
   discovery reports that same authority.
9. Document the API, schema semantics, stable results, namespace boundary, and
   absence of filesystem authority through the raw SQLite escape hatch.

## Non-Goals

- Ariad Operational compilation or lifecycle refresh (DS4–DS5).
- CLI inspect, probe preparation, or probe publication routes (DS6).
- Extension manifest/schema changes or capability declarations.
- Tactical/Strategic semantic interpretation or staleness repair.
- Release, installation, consumer return, TypeScript parity, or Nautilus work.

## Acceptance Behavior

```text
Given ExtensionAPI is bound to an installed extension ID
When the extension publishes a valid document for a registered Journey
Then namespace and producer identity are enforced from that binding
And DS2 publishes the document as one linearizable Journey update

Given the extension attempts Ariad or cross-extension access
When it publishes or inspects through journey_projections
Then the operation fails with a bounded namespace violation
And no projection, manifest, or receipt authority advances

Given an extension supplies an optional valid JSON Schema
When it publishes a document satisfying that schema
Then validation remains offline and publication succeeds
But a mismatch or unresolved reference fails before mutation
```

## Validation Route

- Red-first unit tests prove façade shape, call/document identity, namespace and
  producer binding, Ariad reservation, optional schemas, and bound inspection.
- Real-kernel integration tests use temporary SQLite Journey registries and
  synthetic roots to prove publication, manifest preservation, isolation, and
  registered-root authority.
- Loader regressions prove loaded extensions receive the same façade.
- Capability tests prove Extension API `1.1` is the single authority.
- Focused ruff, format, mypy, docs lint, full non-live regression suite, and the
  unchanged acceptance-kit hashes/16 self-tests form the closure gate.

## Implementation Contract

- TDD for behavior changes; authority failures must be red before production
  wiring lands.
- Namespace comes only from `extension_id`; no actor/target namespace parameter.
- `ariad` is Core-only and cannot be published or inspected through this façade.
- Authority and schema failures occur before receipt or public mutation.
- Inspection uses DS2 consistency and performs no repair or synthesis.
- Existing Extension API database, CLI, context, embedding, LLM, migration, and
  logging behavior remains unchanged.
- No model, network, Pi process, production DB, private Journey fixture,
  TypeScript implementation, or Nautilus dependency.

## Implementation Shape

```text
ExtensionAPI(extension_id, connection)
  └── journey_projections: ExtensionJourneyProjections
        ├── publish(...)  ─ authority ─ JourneyProjectionService.publish
        └── inspect(...)  ─ namespace ─ JourneyProjectionService.inspect

SQLite Journey registry metadata
  └── lazy registered project_path resolver
```

The façade belongs in `memory.journey_projections.extension_api` and is
re-exported from the public projection package. `ExtensionAPI` exposes only the
bound façade instance; internal resolver/service wiring is not extension API.

## Delivery Sequence

1. Add red unit and real-kernel integration tests.
2. Implement façade, authority checks, and lazy registered-root resolver.
3. Wire direct `ExtensionAPI` and `load_extension` construction.
4. Bump and test Extension API version `1.1`.
5. Update public API and architecture docs.
6. Run focused, regression, static, docs, and immutable contract gates.

## Approval Gate

Implementation begins only after Ariad plan approval. Commit, push, release,
installation, and consumer return remain separate Navigator gates.
