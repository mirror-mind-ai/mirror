[< CV23](../index.md)

# CV23.DS1 — Contract Custody and Public Surface

**Status:** ✅ Done

---

## Outcome

Mirror owns a precise Python-side public contract for Journey projections before
filesystem publication begins: versioned models and errors, complete JSON Schema
validation authority, deterministic serialization, capability discovery, and
production-safe test-only guards.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV23.DS1.TS1](cv23-ds1-ts1-define-projection-models-and-stable-errors/index.md) | Define projection models and stable errors | Technical Story | One typed contract owns identifiers, structured results, Extension API version, and stable v1 error codes | ✅ Done |
| [CV23.DS1.TS2](cv23-ds1-ts2-validate-schemas-and-canonical-serialization/index.md) | Validate schemas and canonical serialization | Technical Story | Shared and domain schemas validate through JSON Schema 2020-12 and equivalent input produces canonical bytes | ✅ Done |
| [CV23.DS1.US1](cv23-ds1-us1-discover-the-installed-capability-safely/index.md) | Discover the installed capability safely | User Story | Consumers receive versioned JSON capability discovery while unavailable or test-only operations remain explicit | ✅ Done |

## Done Condition

DS1 is done when public models, validation, serialization, errors, and capability
discovery are deterministic and documented; production cannot reach test-only
operations; no projection publication path or Nautilus dependency has been
introduced; and all DS1 tests plus the full keyless Mirror suite pass.
