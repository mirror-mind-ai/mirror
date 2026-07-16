[< CV9.E2.S7](index.md)

# CV9.E2.S7 — Plan

**Status:** Approved — Navigator confirmed tracking approach 2026-07-16

---

## Design

Changes flow along the layer model (`cli → services → storage`), with the
attempt-counting logic owned by the service and the isolation owned by the
loops.

### config.py — one env-overridable knob

```python
EXTRACTION_MAX_ATTEMPTS = int(os.getenv("MEMORY_EXTRACTION_MAX_ATTEMPTS", "3"))
```

Mirrors the AI-01 timeout knobs added directly above it.

### services/conversation.py — the bookkeeping chokepoint

- `_run_extraction` becomes an orchestrator: eligibility guard, then
  `try: return self._extract_and_persist(...)` / `except: record attempt;
  raise`. The existing pipeline body moves verbatim into `_extract_and_persist`
  (single responsibility: run + persist), so the failure bookkeeping lives in
  one place both callers (`extract_conversation` and `end_conversation`)
  inherit.
- `_record_failed_extraction_attempt(conversation_id)` reads the metadata JSON,
  increments `extraction_attempts`, and sets `extraction_quarantined = true`
  once attempts reach `EXTRACTION_MAX_ATTEMPTS`. No schema change.
- `end_conversation` wraps extraction in `try/finally` so
  `finalize_metadata_on_close` always runs (today it is skipped when extraction
  throws). `ended_at` is still set before extraction, so the orphan is closed
  regardless of extraction outcome. The exception still propagates — the loops
  isolate it.

The threshold is imported by name (like `LOG_LLM_CALLS`) so tests override the
module binding `memory.services.conversation.EXTRACTION_MAX_ATTEMPTS`, matching
the codebase's existing patch style.

### storage/conversations.py — queue exclusion + count

- `get_unextracted_conversations()` gains
  `AND (metadata IS NULL OR json_extract(metadata,'$.extraction_quarantined')
  IS NOT 1)`, mirroring the existing `$.extracted IS NOT 1` predicate.
- `count_quarantined_conversations() -> int` for the report line.

### cli/conversation_logger.py — isolation + visibility

- `extract_pending`: `try/except + continue` per conversation; returns the
  count **successfully** extracted (was `len(pending)` — a truer number).
- `close_stale_orphans`: `try/except` per orphan; the orphan is still counted
  as closed because `ended_at` is set before extraction.
- `session_maintenance`: append the quarantine warning line when
  `count_quarantined_conversations() > 0`.

---

## Compatibility

- No schema migration; metadata is additive JSON.
- `MEMORY_EXTRACTION_MAX_ATTEMPTS` unset → default 3, prior behavior for
  healthy conversations is unchanged (they extract on the first attempt and are
  marked `extracted`).
- Existing `close_stale_orphans` unit test uses a success mock; `count == 1`
  and the `end_conversation` assertion still hold.
- `extract_pending`'s return type stays `int`; the one caller
  (`session_maintenance`'s `_timed_step`) is unaffected.

---

## Risks

1. **Return-value semantics of `extract_pending`.** Changing `len(pending)` →
   successful count is a truthfulness improvement but a behavior change.
   Mitigation: no test asserts the old value; the maintenance report reads
   "Extracted pending conversations: N", which becomes accurate.
2. **`end_conversation` now re-raises after finalize.** It already raised
   before (via `extract_memories`); the only change is that finalize now runs
   first. Callers that previously saw the raise still see it. Verified against
   the existing end-conversation tests.
3. **Quarantine hides a recoverable conversation.** A transient multi-session
   outage could quarantine a conversation that would later succeed. Accepted
   for 1.0: quarantine is visible (report line) and the flag is a plain
   metadata field a future "requeue" affordance can clear. Default of 3
   attempts spans multiple session starts before quarantine.

---

## Verification approach

- **Storage:** `get_unextracted_conversations` excludes quarantined;
  `count_quarantined_conversations` counts them.
- **Service:** failed extraction records an attempt and re-raises; quarantine
  trips at the threshold and removes the conversation from the pending set;
  `end_conversation` finalizes and sets `ended_at` even on failure.
- **Loops:** `extract_pending` with a poisoned middle conversation extracts the
  other two and isolates the failure; `close_stale_orphans` closes every
  non-active orphan despite one failing extraction; `session_maintenance`
  surfaces the quarantine count.
- Full CI gate per the development guide.

Details in [test-guide.md](test-guide.md).
