[< Parent](../index.md)

# CV23.DS1.TS2 — Validate schemas and canonical serialization

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Mirror validates shared, manifest, Operational, generic extension, and optional
extension-owned schemas through an offline JSON Schema 2020-12 authority and
produces byte-deterministic UTF-8 JSON.

## Evidence

- packaged schemas under `src/memory/journey_projections/schema_documents/`
- `src/memory/journey_projections/schemas.py`
- `src/memory/journey_projections/serialization.py`
- valid/invalid, remote-reference refusal, unsafe-relative-path, Unicode,
  ordering, non-finite value, and digest tests

## Acceptance

Local references resolve without network retrieval. Schema errors and
serialization failures are payload-free. Equivalent mappings produce sorted,
two-space-indented UTF-8 bytes with exactly one trailing newline and a stable
SHA-256 digest.
