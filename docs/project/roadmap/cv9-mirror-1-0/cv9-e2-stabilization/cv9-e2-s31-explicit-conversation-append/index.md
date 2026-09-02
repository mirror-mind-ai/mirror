[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S31 — Explicit Conversation Append Boundary

**Status:** ✅ Done
**Epic:** CV9.E2 Stabilization & Robustness
**Consumer reference:** Nautilus Harness `CV-002.DS-005` (evidence and compatibility input only)
**Release intent:** PATCH `v0.31.13`

---

## Outcome

An external caller that already owns one exact Mirror conversation ID can append a bounded batch of externally identified user and assistant messages to that conversation through a generic JSON CLI. The complete operation is atomic, retries are idempotent by caller-supplied message ID, the expected Journey is checked before writing, and runtime-session state is neither consulted nor changed.

## Public Command

```bash
uv run python -m memory conversations append \
  --mirror-home PATH \
  --format json < payload.json
```

Payload content enters only through standard input. Expected success and failure produce bounded JSON. Expected failures use stable reason codes and nonzero exit status.

## Public Request

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
      "metadata": {
        "sourceTurnId": "caller-stable-turn-id"
      }
    }
  ]
}
```

## Public Success Receipt

```json
{
  "schemaVersion": "1.0.0",
  "status": "accepted",
  "conversationId": "exact-full-conversation-id",
  "journeyId": "journey-slug",
  "insertedCount": 1,
  "existingCount": 0,
  "messages": [
    {
      "id": "caller-stable-user-message-id",
      "state": "inserted"
    }
  ]
}
```

A complete retry is also accepted, reports `insertedCount: 0`, and marks every message `existing`. A partial prior write may acknowledge byte-equivalent existing messages and insert only missing messages in one transaction. Because success receipts echo each accepted message ID, `messages[].id` is validated as bounded safe ASCII before any write; rejected IDs are never reflected into a per-message receipt.

## Public Failure Receipt

```json
{
  "schemaVersion": "1.0.0",
  "status": "rejected",
  "reason": "journey_mismatch",
  "message": "Conversation belongs to a different journey."
}
```

Public v1 reason codes:

- `malformed_request`
- `unsupported_schema_version`
- `limit_exceeded`
- `conversation_not_found`
- `journey_mismatch`
- `duplicate_request_message_id`
- `idempotency_conflict`
- `persistence_failure`

`conversation_not_appendable` is deliberately absent from v1 because the current Mirror lifecycle has no durable state that can emit it.

## Bounds

- Raw stdin payload: at most 262,144 UTF-8 bytes (256 KiB). The CLI reads at most 262,145 bytes and rejects overflow before JSON parsing; it never loads arbitrarily large stdin.
- Messages per request: 1–20.
- Message ID: safe ASCII matching exactly `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}` and unique within the request. This admits UUIDs and timestamp-shaped caller IDs with period, hyphen, and colon while excluding empty IDs, whitespace, line breaks, controls, Unicode multibyte characters, and values longer than 128 bytes/characters.
- Role: `user` or `assistant`.
- Content: non-empty and at most 51,200 UTF-8 bytes per message.
- `sourceInterface`: 1–64 ASCII characters matching `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`.
- Caller metadata: a JSON object. The 4,096 UTF-8-byte metadata limit applies to the complete canonical persisted envelope, not only to the caller object.
- `createdAt`: timezone-aware RFC 3339 input, normalized before persistence and comparison to UTC `YYYY-MM-DDTHH:mm:ss.ffffffZ`.

## Persisted Metadata Contract

Each inserted message stores one canonical JSON TEXT envelope in `messages.metadata`:

```json
{
  "callerMetadata": {
    "sourceTurnId": "caller-stable-turn-id"
  },
  "mirrorAppend": {
    "schemaVersion": "1.0.0",
    "sourceInterface": "external-shell"
  }
}
```

Mirror owns `mirrorAppend`; caller fields live only below `callerMetadata`, so caller-controlled keys cannot collide with Mirror provenance. The envelope is serialized as compact UTF-8 JSON with sorted keys and `ensure_ascii=false`. Idempotency compares the exact destination plus role, content, normalized creation time, `sourceInterface`, and canonical caller metadata.

## Conversation Lifecycle Rule

An exact existing conversation remains an eligible explicit-append destination whether `ended_at` is null or populated. This preserves model-free retry to an older generation's original Mirror conversation after a consumer activates a newer generation.

Late append:

- does not reopen the conversation;
- does not change `ended_at`;
- does not run or reset extraction;
- does not regenerate semantic memory, summaries, titles, tags, or embeddings;
- does not create, select, inspect, bind, rebind, or update any runtime session.

The caller must retain the original full `conversationId`. Mirror never infers a destination from active generation, recency, title, prefix, runtime session, or conversation lists.

## Atomicity And Idempotency

The service validates every message ID against `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}` before the storage boundary starts, so an empty, whitespace-bearing, newline-bearing, control-bearing, Unicode, or 129-character ID rejects the complete request before any write. The storage boundary then uses one explicit SQLite transaction. It validates the exact conversation and Journey, reads all request message IDs, classifies identical existing rows, rejects every conflict, inserts only absent rows, and commits once. Any conflict or persistence failure rolls the complete new batch back.

Caller-supplied message ID is the idempotency key:

- absent ID: insert into the explicit destination;
- identical row in that destination: acknowledge as `existing`;
- same ID in another conversation: reject the complete batch;
- same ID with divergent role, content, normalized creation time, `sourceInterface`, or canonical caller metadata: reject the complete batch.

Message reads become deterministic with `ORDER BY created_at, id`.

## Acceptance Criteria

- A bounded user/assistant batch lands in the exact conversation atomically.
- Full and partial retries do not duplicate messages.
- A conflicting ID rejects all new writes.
- Journey mismatch and missing destination create nothing.
- Ended conversations accept exact late retries without reopening or re-extraction.
- Stale or newer runtime-session/generation state cannot redirect, block, authorize, or observe the append.
- No SQL statement reads or writes `runtime_sessions`.
- CLI stdin, JSON output, reason codes, exit statuses, UTF-8 byte limits, canonical timestamps, canonical metadata, and privacy boundaries are test-covered.
- Message IDs enforce `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}` before any write; empty, whitespace, newline, control, Unicode, and 129-character IDs reject, while UUID and timestamp-shaped IDs remain valid.
- Public receipts remain safe and bounded because they echo only validated ASCII message IDs of at most 128 characters and never echo rejected raw IDs.
- Pathological JSON nesting, unpaired Unicode surrogates, and equivalent recursion/UTF-8 encoding failures reject as `malformed_request` before database access, with no traceback or caller content echoed.
- Existing runtime conversation logging remains unchanged.

## Conscious Exclusions

- No Nautilus, Harness generation, correlation, turn, outbox, or retry schema in Mirror Core.
- Compatibility and migration for historical Harness outboxes belong to the Harness consumer.
- No conversation creation, reopening, closing, switching, repair, or runtime reconciliation.
- No Pi JSONL reads, `conversation-logger`, extraction, model call, title generation, summary generation, embedding, or semantic-memory refresh.
- No prefix resolution for conversation IDs.
- No TypeScript implementation while CV22 remains paused.

## Release Intent

This independent Story produces a PATCH under the project versioning taxonomy. The intended release is `v0.31.13`; it does not close CV9.E2 and therefore does not justify a MINOR release.

## See Also

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Versioning](../../../../../process/versioning.md)
- [Architecture](../../../../../product/architecture.md)
