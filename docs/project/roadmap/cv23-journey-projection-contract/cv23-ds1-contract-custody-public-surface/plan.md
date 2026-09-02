# Delivery Story Plan — CV23.DS1

**Journey:** mirror-mind-development
**Method:** ariad
**Navigator Flow Unit:** delivery_story
**Status:** Approved through the CV23 plan approval on 2026-08-19

## Delivery Story

Contract Custody and Public Surface

## Objective

Establish the complete public v1 contract authority in Python—typed projection
models, stable structured errors, JSON Schema 2020-12 validation, canonical
serialization, capability discovery, and production-safe test-only operation
guards—without implementing filesystem publication or depending on Nautilus
internals.

## Child Work Packages

- CV23.DS1.TS1 — Define projection models and stable errors
- CV23.DS1.TS2 — Validate schemas and canonical serialization
- CV23.DS1.US1 — Discover the installed capability safely

## Scope

1. Add a cohesive `memory.journey_projections` package owning contract ID/version,
   Extension API version, identifier validation, typed envelope/manifest/result
   models, and stable structured error codes.
2. Add Mirror-owned JSON Schema 2020-12 documents for the shared envelope,
   manifest, Operational projection, and generic extension projection.
3. Add one schema-validation authority using the maintained `jsonschema` runtime
   dependency, including local `$ref` resolution and format checking.
4. Add canonical UTF-8 JSON serialization: sorted keys, two-space indentation,
   Unicode preserved, and one trailing newline.
5. Add a thin `journey-projection capabilities` CLI route with JSON-only output,
   explicit `--mirror-home`/`--format json` handling, contract/API versions, and
   only operations actually implemented at the current story boundary.
6. Add one reusable production guard for future `probe-prepare`/`probe-publish`
   commands. It requires `MEMORY_ENV=test`, an explicit isolated home, and
   canonical inequality from the configured production home.
7. Reuse the existing independent Extension API baseline `1.0` as the installed
   version authority. DS3 will increment it when the additive
   `journey_projections` façade actually becomes public.

## Non-Goals

- No projection directory, temp file, receipt, manifest write, lock, or inspect.
- No Ariad Operational compiler or lifecycle refresh.
- No `ExtensionAPI.journey_projections` publication façade yet.
- No `probe-prepare` or `probe-publish` behavior beyond the reusable guard.
- No Nautilus import/runtime dependency and no acceptance-kit modification.
- No TypeScript implementation and no SQLite migration.
- No claim that the complete v1 capability is conformant before DS2–DS6 land.

## Acceptance Behavior

1. **Given** a valid envelope/manifest/domain document, **when** Mirror validates
   it, **then** JSON Schema 2020-12 rules and formats pass with local references
   resolved without network access.
2. **Given** a malformed document, **when** validation runs, **then** one bounded
   `schema_validation_failed` error is returned without echoing payload content.
3. **Given** equivalent mappings with different insertion order, **when**
   serialized, **then** bytes are identical UTF-8 canonical JSON.
4. **Given** invalid identifiers, timestamps, producer data, or paths, **when**
   modeled/validated, **then** stable typed errors reject them before any I/O.
5. **Given** capability discovery, **when** called with JSON format, **then** it
   reports contract `1.0`, the currently installed Extension API `1.0`, and only
   implemented operations.
6. **Given** any future probe-only operation guard outside isolated test mode,
   **when** evaluated, **then** it fails closed with `unsupported_contract` and
   does not create or open a database.
7. Errors and logs never include projection payload, transcript, prompt, response,
   secret, environment dump, or private path content.

## Design

```text
memory.journey_projections
  constants.py       contract/API versions and operation registry
  models.py          immutable DTOs and identifier/path-independent checks
  errors.py          stable error enum and structured failure
  schemas.py         packaged-schema loading and offline validation
  serialization.py   canonical bytes and digest helpers
  test_guard.py      isolated test-mode authorization

memory.cli.journey_projection
  capabilities transport only
```

Schema documents live as package data under
`memory/journey_projections/schema_documents/`; they are Mirror's implementation
of the public contract, not an import from the consumer workspace. Local schema
resolution uses a registry/store assembled from those packaged documents. No
HTTP resolver is permitted.

The CLI parser is strict: unknown operations and unsupported formats produce
bounded structured JSON and nonzero exit. `capabilities` does not touch the DB or
require a configured Journey. Later stories extend the operation registry only
when the corresponding route is implemented.

## Validation Route

E2E is required but driver-owned per explicit Navigator instruction. Use a
subprocess with temporary `HOME` and `MIRROR_HOME`, no API keys, and verify exact
JSON capability output and bounded unknown-operation errors. Unit tests cover
schema/ref resolution, canonical bytes, model constraints, error redaction, and
test-only guards. Run the full keyless Mirror suite and the unchanged acceptance
kit self-tests.

## Implementation Contract

- TDD for each behavior and error path.
- No filesystem publication scaffolding in DS1.
- No network access during schema validation or tests.
- No production/development database fixture.
- Keep CLI thin and package responsibilities cohesive.
- Update public extension/API/reference docs in the same story.
- Accelerated cadence may cross soft stops, but scope, unsafe operations,
  commit/push/release, and final Done boundaries remain hard gates.

---

_Approval and lifecycle state are tracked by the Builder runtime; this artifact
records the approved aggregate scope used for implementation._
