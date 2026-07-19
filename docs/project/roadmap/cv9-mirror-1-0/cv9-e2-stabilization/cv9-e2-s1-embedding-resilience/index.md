[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S1 — Embedding Resilience

**Status:** Done  
**Epic:** CV9.E2 Stabilization & Robustness  
**Trigger:** Live failure while recording an active Mirror memory: `ValueError: No embedding data received`

---

## User-Visible Outcome

When Mirror Mind needs an embedding for a memory, attachment, or search query,
provider instability should not produce confusing stack traces or bad semantic
state. The system should retry transient failures, fail with a clear message when
it cannot recover, and never store fake or unusable embeddings as if everything
worked.

---

## Problem

The current embedding boundary assumes the provider always returns at least one
embedding:

```python
return np.array(response.data[0].embedding, dtype=np.float32)
```

A real session produced:

```text
ValueError: No embedding data received
```

The immediate failure was recoverable — a later embedding health check worked —
but the runtime behavior exposed two issues:

1. **Provider responses are trusted too much.** Empty `response.data` or missing
   embedding payloads are not handled as first-class failure modes.
2. **Manual workaround risk is high.** Writing a placeholder or zero vector keeps
   the row alive but corrupts semantic search quality for that memory.

This is exactly the kind of edge behavior CV9 should harden before 1.0.

---

## Scope

In scope:

- Introduce an explicit embedding failure type or error boundary.
- Validate embedding responses before indexing into `response.data[0]`.
- Add bounded retry for transient embedding failures.
- Ensure memory and attachment writes are atomic with embedding success: no row is
  stored with a fake vector when embedding generation fails.
- Ensure search paths fail cleanly or degrade explicitly when query embedding
  generation fails.
- Add tests for empty response, missing payload, provider exception, retry
  success, retry exhaustion, and no-write-on-failure behavior.

Out of scope:

- A background re-embedding queue.
- Schema changes for `embedding_status` or pending repair.
- Changing embedding provider/model.
- Reworking the full hybrid search architecture.

---

## Done Condition

- Empty embedding responses produce a clear domain-level error, not an accidental
  index error or generic stack trace.
- Transient empty/provider failures are retried with a small bounded policy.
- If all retries fail during `add_memory`, no memory row is created.
- If all retries fail during `add_attachment`, no attachment row is created.
- Query embedding failures in memory/attachment search are handled intentionally:
  either clear failure or explicit lexical-only fallback if the implementation
  chooses that path.
- Unit tests cover embedding response validation and retry behavior.
- Service tests cover no-write-on-failure for memories and attachments.
- Docs/worklog are updated when implemented.

---

## See also

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [CV9.E2 Stabilization & Robustness](../index.md)
