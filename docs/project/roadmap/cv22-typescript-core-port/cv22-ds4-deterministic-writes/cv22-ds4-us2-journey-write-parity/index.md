[< Parent](../index.md)

# CV22.DS4.US2 — Journey Write Parity

**Status:** ✅ Done
**Type:** User Story
**Depends on:** [CV22.DS4.TS1 Write Parity Harness & Backup Gate](../cv22-ds4-ts1-write-parity-harness/index.md), [CV22.DS4.US1 Reinforcement Write Parity](../cv22-ds4-us1-reinforcement-write-parity/index.md)

---

## User Story

As Mirror, I want journey writes — creating a journey and setting its project
path — to run through the TS core exactly as the Python core does, so journey
management can move to TS with the `identity` table byte-for-byte identical,
including its JSON metadata.

## Outcome

The identity-table write primitives (`upsert_identity`, `update_identity_metadata`)
and a Python-compatible JSON serializer are ported to the TS core. Journey writes
are proven byte-for-byte against the real Python oracle: `create_journey`
(identity INSERT) and `set_project_path` (metadata UPDATE), under an injected `id`
and a frozen `now`.

## Scope

- A Python-compatible JSON serializer (matches `json.dumps`).
- `upsertIdentity` (INSERT/UPDATE `identity`) and `updateIdentityMetadata` over
  the writable seam, with injected `id` and `now`.
- Journey probes: `create_journey` and `set_project_path`, proven against the real
  `JourneyService` oracle through the DS4.TS1 harness.

## Out Of Scope

- Identity writes for other layers — personas, ego (CV22.DS4.US3).
- Live front-door write routing.
- External-API writes, memory creation (CV22.DS5).
- Schema change.

## Validation

Harness journey probe (identity-table state-diff including the metadata JSON
string) PASS/FAIL; demo-DB e2e; fixture-level route (same posture as TS1/US1).
