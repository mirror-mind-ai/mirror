# Plan — CV22.DS4.US2

## Objective

Port the identity-table write primitives (`upsert_identity` +
`update_identity_metadata`) and a Python-compatible JSON serializer to the TS
core, proving journey writes — `create_journey` (identity INSERT) and
`set_project_path` (metadata UPDATE) — byte-for-byte against the real Python
oracle through the DS4.TS1 harness, under an injected `id` and a frozen `now`.

## Scope

- **Python-compatible JSON serializer** (`pyJsonDumps`): match `json.dumps`
  exactly — `", "` / `": "` separators, `ensure_ascii` escaping of non-ASCII, and
  `sort_keys`, parameterized per call site (`create_journey` uses
  `sort_keys=True, ensure_ascii=False`; `set_project_path` uses the defaults).
- **Identity write primitives** over the writable seam, mirroring
  `src/memory/storage/identity.py`:
  - `upsertIdentity`: INSERT `(id, layer, key, content, version, created_at,
    updated_at, metadata)` when absent, else UPDATE `(content, version,
    updated_at, metadata)`. `id` and `now` are injected for deterministic parity
    (the Python `id` is a random UUID and `now` a microsecond timestamp).
  - `updateIdentityMetadata`: UPDATE `identity SET metadata, updated_at WHERE
    layer, key`, with injected `now`.
- **Journey probes** (the parity subjects):
  - `create_journey` → compose metadata from fields → `pyJsonDumps(sort_keys=True,
    ensure_ascii=False)` → `upsertIdentity` INSERT.
  - `set_project_path` → read the journey identity metadata → set `project_path` →
    `pyJsonDumps(defaults)` → `updateIdentityMetadata`.
- **Snapshot the identity row** (`id, layer, key, content, version, created_at,
  updated_at, metadata`) via the harness's multi-table/insert-aware snapshot.
- **Real Python oracle**: the driver drives `JourneyService.create_journey` +
  `set_project_path` on a copy with the identity-store clock frozen, captures the
  generated `id` and stamped `now`, and records the identity-table `python_state`;
  TS echoes the injected `id` + `now`.

## Non-Goals

- Identity writes for other layers — personas, ego (CV22.DS4.US3).
- The journey service's non-write validation logic beyond what the probe needs.
- Live front-door write routing.
- External-API writes, memory creation, embeddings (CV22.DS5).
- Schema change.

## Acceptance Behavior

```text
Given a seeded memory.db copy, an injected identity id, and a frozen now
When JourneyService.create_journey(...) + set_project_path(...) run through the Python core,
     and TS upsertIdentity/updateIdentityMetadata run on a parallel copy with the same id + now
Then the identity row is byte-for-byte equal across both copies:
     id, layer, key, content, version, created_at, updated_at, and the metadata JSON string
And no other row or column changes
```

## Validation Route

- **Automated:** `pyJsonDumps` unit tests vs known Python outputs (separators,
  `ensure_ascii`, `sort_keys`); `upsertIdentity` / `updateIdentityMetadata` unit
  tests; a journey probe (identity-table incl. metadata) PASS/FAIL; TS suite
  green; typecheck / biome / ruff clean.
- **Navigator-visible:** generate demo DB, run `write_parity.py` with the journey
  probe → `overall_match: true`, exit 0.
- **E2E decision:** fixture-level demo-DB route (same posture as TS1/US1).
  (Navigator to accept.)

## Implementation Contract

- TDD: `pyJsonDumps` first (the riskiest parity piece), then the identity
  primitives, then the journey probe + real oracle.
- Keep scoped to `CV22.DS4.US2` (serializer + identity primitives + journey
  probe); no other-layer identity writes, no live routing.
- Use `uv run` for Python; commit only story-scoped files with descriptive
  English messages.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
