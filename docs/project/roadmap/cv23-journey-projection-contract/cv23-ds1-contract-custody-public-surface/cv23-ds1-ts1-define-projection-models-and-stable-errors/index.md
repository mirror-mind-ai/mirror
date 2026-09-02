[< Parent](../index.md)

# CV23.DS1.TS1 — Define projection models and stable errors

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

One immutable Python contract owns v1 identifiers, envelope/manifest DTOs,
installed Extension API version authority, and nine stable payload-free error
codes.

## Evidence

- `src/memory/journey_projections/constants.py`
- `src/memory/journey_projections/errors.py`
- `src/memory/journey_projections/models.py`
- focused model/error tests in `tests/unit/memory/journey_projections/`

## Acceptance

Invalid identifiers and malformed typed documents fail before I/O with bounded
structured errors that do not echo caller content. Contract and schema versions
are explicit and capability discovery reads the existing Extension API version
authority rather than duplicating it.
