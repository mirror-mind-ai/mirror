[< CV9.E2.S31](index.md)

# Plan — CV9.E2.S31 Explicit Conversation Append Boundary

## Pull

Pull `CV9.E2.S31` as one implementable Story because the capability is independently releasable, has one public JSON boundary, and can be verified end to end without closing CV9.E2. The consumer need is urgent only after Mirror releases and installs the generic provider primitive; Harness adoption remains downstream.

## Prepare

The existing path `ConversationService.add_message()` delegates to `MessageStore.add_message()`, which commits every insert. It cannot provide atomic batch semantics by being called repeatedly. Existing runtime logging also chooses conversations through `runtime_sessions`, while this boundary must accept one exact conversation ID and make runtime sessions irrelevant.

The current schema already gives `messages.id` global uniqueness and stores message metadata as JSON TEXT. No schema migration is needed for v1. A dedicated service and transaction-aware storage operation can preserve the established layer direction:

```text
CLI -> explicit append service -> explicit append storage -> SQLite
```

Applicable rules:

- Python is sole product authority while CV22 is paused.
- CLI remains transport-only; SQL belongs in storage.
- Behavior changes use TDD.
- Runtime tests use an isolated Mirror home/database.
- Output never leaks message content, arbitrary metadata, environment values, private paths, or raw exceptions.
- Release intent is PATCH `v0.31.13`.

## Scope

- Add `conversations append` as a JSON-stdin/JSON-stdout CLI operation with explicit `--mirror-home` and `--format json`.
- Bound stdin while reading: read no more than 262,145 bytes for a 262,144-byte maximum.
- Validate schema, exact fields, finite UTF-8 byte limits, item count, roles, IDs, metadata shape, source interface, and timezone-aware timestamps before writes.
- Require every `messages[].id` to match exactly `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}` before entering storage, excluding empty IDs, whitespace, line breaks, controls, Unicode multibyte characters, and 129-character values while preserving UUID and timestamp-shaped IDs.
- Normalize `createdAt` to UTC `YYYY-MM-DDTHH:mm:ss.ffffffZ` before persistence and idempotency comparison.
- Build and size the complete canonical metadata envelope before writes.
- Resolve only the exact `conversationId`; never use prefix matching.
- Require exact equality between `journeyId` and the destination conversation's Journey.
- Accept explicit append to open or ended conversations without changing lifecycle fields.
- Add one storage-owned explicit SQLite transaction that validates existing IDs, rejects conflicts, inserts absent messages, and commits once.
- Persist `sourceInterface` per message inside the Mirror-owned metadata envelope.
- Compare destination, role, content, canonical creation time, source interface, and canonical caller metadata for idempotency.
- Stabilize message reads with `ORDER BY created_at, id`.
- Emit bounded success/error receipts and stable public v1 reason codes.
- Document the public boundary in REFERENCE/API or architecture documentation, worklog, roadmap, test guide, and the future `v0.31.13` release note during implementation/closure.

## Non-Goals

- No `conversation_not_appendable` reason in v1.
- No conversation create, reopen, close, switch, repair, extraction reset, or metadata lifecycle mutation.
- No extraction, semantic-memory refresh, title, summary, tag, embedding, model, or network call.
- No access to `runtime_sessions` for destination choice, validation, authorization, observation, or mutation.
- No Pi JSONL or `conversation-logger` reuse.
- No Nautilus/Harness generation, correlation, turn, outbox, or retry semantics in Mirror Core.
- No compatibility adapter for historical Harness outboxes; the consumer owns it.
- No TypeScript parity work while CV22 is paused.
- No version bump, commit, push, tag, stable promotion, GitHub Release, production update, or production checkout mutation during implementation without their later explicit gates.

## Public Contract

### Request

```json
{
  "schemaVersion": "1.0.0",
  "conversationId": "exact-full-conversation-id",
  "journeyId": "journey-slug",
  "sourceInterface": "external-shell",
  "messages": [
    {
      "id": "caller-stable-user-message-id",
      "role": "user",
      "content": "message content",
      "createdAt": "2026-08-29T12:00:00.000Z",
      "metadata": {"sourceTurnId": "caller-stable-turn-id"}
    }
  ]
}
```

### Message ID

`messages[].id` is safe ASCII matching exactly `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. Validation occurs for the complete request before any storage transaction or write. Valid examples include UUID `550e8400-e29b-41d4-a716-446655440000` and timestamp-shaped ID `turn:2026-08-29T12:00:00.000Z`. Empty IDs, spaces or other whitespace, newlines, control characters, Unicode, and 129-character values are rejected without writing.

The public success receipt may echo only IDs that passed this validation. Therefore each echoed ID is ASCII-only, single-line, control-free, and bounded to 128 characters; invalid raw IDs are not reflected in failure receipts.

### Persisted message metadata

```json
{
  "callerMetadata": {"sourceTurnId": "caller-stable-turn-id"},
  "mirrorAppend": {
    "schemaVersion": "1.0.0",
    "sourceInterface": "external-shell"
  }
}
```

Canonical serialization uses sorted keys, compact separators, UTF-8, and `ensure_ascii=false`. The full serialized envelope must be at most 4,096 UTF-8 bytes.

### Success

```json
{
  "schemaVersion": "1.0.0",
  "status": "accepted",
  "conversationId": "exact-full-conversation-id",
  "journeyId": "journey-slug",
  "insertedCount": 1,
  "existingCount": 0,
  "messages": [{"id": "caller-stable-user-message-id", "state": "inserted"}]
}
```

### Public failure reasons

- `malformed_request`
- `unsupported_schema_version`
- `limit_exceeded`
- `conversation_not_found`
- `journey_mismatch`
- `duplicate_request_message_id`
- `idempotency_conflict`
- `persistence_failure`

Expected validation/authority/conflict failures return bounded JSON and nonzero status. Unexpected persistence exceptions collapse to `persistence_failure` without raw exception text.

## Transaction Design

1. CLI reads at most payload limit + 1 byte; overflow returns `limit_exceeded` before decoding or parsing.
2. Decode strict UTF-8 and parse JSON.
3. Service validates the complete request shape, including every message ID against `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`, and normalizes every timestamp. Any invalid ID rejects here before storage or writes.
4. Service builds each full canonical persisted metadata envelope and applies its UTF-8 byte limit.
5. Storage starts `BEGIN IMMEDIATE` only after all request IDs and other service-level fields pass validation.
6. Inside the transaction, storage reads the exact conversation by primary key and checks exact Journey equality.
7. Storage fetches every request message ID in one bounded query.
8. For each ID, classify absent, identical existing, destination conflict, or payload conflict.
9. Any conflict rolls back before insert.
10. Insert only absent rows using transaction-aware SQL with no nested commit.
11. Commit once and return inserted/existing states in request order.
12. Any SQLite failure rolls back and becomes bounded `persistence_failure`.

`ended_at` is deliberately ignored as an appendability barrier and remains unchanged. No query may mention `runtime_sessions`.

## Implementation Approach

1. Write contract/model validation tests first, including UTF-8 multibyte boundaries and timestamp equivalence.
2. Introduce focused immutable request/result/error types in a cohesive explicit-append module rather than growing runtime logger code.
3. Implement the storage transaction with injected failure coverage and no calls to commit-per-message `add_message()`.
4. Wire a thin CLI subcommand that reads bounded stdin and maps domain outcomes to public JSON/exit status.
5. Add deterministic secondary ordering to ordinary message reads and regression-test existing callers.
6. Document public behavior and the late-append semantic-memory exclusion.
7. Run focused tests, full repository gates, and an isolated-home CLI smoke.
8. Stop at Navigator Validation before review, commit, push, or release work.

## Test Strategy

### Unit/service

- Strict request shape, schema version, role, ID, source-interface, timestamp, metadata, item-count, content and byte-size validation.
- Pathological metadata nesting that raises `RecursionError`, unpaired Unicode surrogates in content or metadata, and equivalent UTF-8/canonical-serialization failures collapse to bounded `malformed_request` before storage, without traceback or payload echo.
- Exact message-ID grammar tests reject empty, whitespace-bearing, newline-bearing, control-bearing, Unicode, and 129-character values before any write; UUID and timestamp-shaped IDs with period, hyphen, and colon pass.
- UTF-8 multibyte content proves byte rather than character counting.
- Equivalent RFC 3339 offsets normalize to identical UTC timestamp.
- Canonical metadata ordering and envelope-size accounting include Mirror provenance.
- Caller keys cannot replace `mirrorAppend`.
- Receipts and errors contain no content or arbitrary metadata; success receipts echo only validated IDs, proving every reflected ID remains ASCII-only, single-line, control-free, and at most 128 characters.

### Storage/integration

- New user/assistant batch reaches the exact destination.
- Full retry is a successful no-op.
- Partial existing batch inserts only missing rows.
- Cross-conversation and divergent-payload ID reuse reject the whole batch.
- Failure during the second insert rolls back all absent rows.
- Missing conversation and Journey mismatch write nothing.
- Open and ended conversations both accept explicit append; ended conversation remains ended.
- Late append does not alter extraction metadata or create semantic-memory rows.
- SQL trace/authorizer evidence proves no `runtime_sessions` read or write.
- `ORDER BY created_at, id` is deterministic for equal timestamps.

### CLI

- Reads request only from stdin.
- Reads at most limit + 1 byte; oversized input is rejected before parse.
- Invalid UTF-8, malformed JSON and unsupported schema return bounded JSON/nonzero status.
- Success/retry receipts and public reason codes match the frozen contract.
- Isolated `--mirror-home` smoke proves no production database access.

### Regression

- Existing `conversation-logger` user/assistant logging remains unchanged.
- Pi/Codex backfill and ordinary conversation reads remain compatible.
- No live provider, model, or production database is required.

## Validation Route

Using a temporary Mirror home:

1. Initialize an isolated database and create one Journey-bound conversation plus an unrelated runtime-session row pointing elsewhere.
2. Append one user/assistant batch through stdin and inspect the exact destination.
3. Repeat the identical request and observe `existing` states with no duplicates.
4. End the destination conversation, append a missing retry message using its original exact ID, and confirm the conversation remains ended.
5. Submit empty, whitespace, newline, control, Unicode, and 129-character message IDs; confirm each rejects before any write, then submit valid UUID and timestamp-shaped IDs and confirm their bounded safe receipt echoes.
6. Submit a conflict, Journey mismatch, oversized multibyte payload, and oversized full metadata envelope; confirm bounded failures and no writes.
7. Compare runtime-session rows, extraction metadata, memories, and production DB checksum before/after; all remain unchanged.

Expected observation: exact atomic transcript append and idempotent retries, including late retry to an ended original destination, with no implicit routing or semantic side effects.

Pass condition: all receipts, rows, ordering, transaction behavior, byte limits, canonical values, and unchanged-state checks match the contract.

Fail condition: any partial write, duplicate, prefix/active-session routing, runtime-session access, lifecycle reopening, semantic extraction, unbounded stdin read, content leak, or contract mismatch.

## Risks

- Existing message metadata is unversioned JSON TEXT; an externally supplied ID colliding with a legacy message must fail closed rather than be adopted.
- Allowing late append after prior extraction intentionally creates transcript content not represented in existing semantic memories. Automatic re-extraction would violate scope and can duplicate or rewrite intelligence, so the limitation remains explicit.
- SQLite transaction helpers that commit internally could accidentally break atomicity; the new storage path must own the transaction completely.
- Character-count tests can falsely validate byte limits; multibyte UTF-8 boundary tests are mandatory.
- Reading all stdin before checking size would defeat the public bound; the CLI test must observe the exact limit+1 read behavior.
- Changing message ordering adds a secondary key to a shared read path; regression coverage must prove no existing lifecycle behavior depends on unstable tie order.
- Public reason codes and envelope shape become release contracts once shipped; additions or semantic changes require versioned evolution.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
