[< CV9.E2.S16](index.md)

# CV9.E2.S16 — Plan

**Status:** Approved — Navigator confirmed D1–D4 2026-07-17 (QA-authored)

---

## Design (honoring D1–D4)

### intelligence/extraction.py — a backward-compatible status sink (D1)

```python
def extract_memories(..., status: dict | None = None) -> list[ExtractedMemory]:
    ...
    data = _parse_json_response(response.content)
    if not isinstance(data, list):
        if status is not None:
            status["extraction_status"] = "parse_failed"
        return []
    ...
    kept, dropped = _sanitize_extracted(...)
    if status is not None:
        status["extraction_status"] = "ok" if kept else "no_signal"
        status["dropped"] = dropped
    return kept
```

The list return is unchanged, so evals and `test_extraction` are untouched and —
critically — the ~10 service tests that `patch(...extract_memories, return_value=[list])`
stay green: their mock ignores the `status=` kwarg, the sink stays empty, and the
caller falls back to a count-based status.

### services/conversation.py — record it in metadata

- `_extract_and_persist`: `diag: dict = {}`, `extract_memories(..., status=diag)`;
  at the existing `meta["extracted"] = True` block, add
  `meta["extraction_status"] = diag.get("extraction_status") or ("ok" if stored_memories else "no_signal")`
  and `meta["extraction_dropped"] = diag["dropped"]` when any count is non-zero.
- `_record_failed_extraction_attempt` (the exception path): also set
  `meta["extraction_status"] = "llm_failed"` (D2 — covers pipeline exceptions,
  LLM primary). It still re-raises, so S7 quarantine/retry is untouched.

### cli/conversation_logger.py — surface the aggregate

Add `store.count_conversations_with_extraction_status("parse_failed")` and, in
`session_maintenance`, a `⚠ N conversation(s) with unreadable model output` line
next to the quarantined line (D4 — all-time count, mirroring S7).

## Acceptance criteria (the QA spine)

| # | When | Then |
|---|---|---|
| AC1 | malformed JSON response | metadata `extraction_status = parse_failed` |
| AC2 | valid empty `[]` | `no_signal` |
| AC3 | ≥1 memory kept | `ok` |
| AC4 | pipeline raises | `llm_failed` **and** still raises + increments attempts (S7 intact) |
| AC5 | all items dropped by S15 sanitize | `no_signal` **and** `extraction_dropped` recorded (not `parse_failed`) |
| AC6 | a conversation fails then succeeds on retry | final status is `ok` (overwrites `llm_failed`) |
| AC7 | `parse_failed` conversations exist | `session_maintenance` prints the `⚠` line |
| AC8 | existing mocked service tests | unchanged and green (sink-empty fallback) |

## Critical journeys

- **Provider hiccup:** extraction raises → `llm_failed` → S7 retries → succeeds →
  `ok`. The user never sees a phantom empty success.
- **Persistently mangled output:** model returns prose, not JSON → `parse_failed`,
  conversation marked processed (not retried), and the `⚠` line makes the loss
  visible at the next session.

## Edge & failure cases

- **All-dropped vs unreadable:** sanitize dropping every item is `no_signal` with
  `extraction_dropped`, not `parse_failed` — different root causes, different
  status (AC5).
- **Skipped conversations:** those that never run extraction (no journey / too
  short) carry **no** status — a conscious boundary; journey-less extraction is
  AI-21's concern, not this story.
- **Cumulative count:** the `parse_failed` maintenance count is all-time and only
  grows (D4); acceptable and consistent with the quarantined line.

## Regression safety

- **Metadata is additive.** Every conversation-metadata reader uses `.get(key)`
  (web read model, title/summary/tags sources); nothing enumerates or validates
  the key set, so new keys cannot break a reader. Verified by inspection.
- **S7/S9 untouched.** The exception path still re-raises; the success path still
  stages embeddings then marks `extracted`. Their regression suites must stay green.

## Verification

Unit tests per status path (AC1–AC6); a `session_maintenance` report test (AC7);
the full service suite green unchanged (AC8); S7 quarantine + S9 idempotency
regressions green. **No eval needed** — no prompt change.
