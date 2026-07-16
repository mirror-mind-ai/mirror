[< CV9.E2](../index.md)

# CV9.E2.S7 — Extraction Failure Isolation & Quarantine

**Status:** Done — Navigator validated 2026-07-16
**Epic:** CV9.E2 — Stabilization & Robustness
**Source:** [AI Engineering Audit — AI-02](../../../../ai-engineering-audit.md) (P0)

---

## User-visible outcome

One conversation that reliably fails to extract (provider outage, oversized
transcript, auth error) no longer silently swallows the memory of every
conversation queued behind it. Failing conversations are isolated, retried a
bounded number of times, then quarantined and reported — instead of crashing
the maintenance loop and being re-attempted (and re-charged) at every session
start forever.

---

## Problem

Two maintenance loops call extraction with **no per-conversation isolation**,
and the extraction entry point does not fail soft:

- `conversation_logger.extract_pending()` → `extract_conversation()` — a bare
  loop over every unextracted conversation.
- `conversation_logger.close_stale_orphans()` →
  `end_conversation(extract=True)` → `_run_extraction()` →
  **`extract_memories()`**, which — unlike its `title` / `tags` / `summary` /
  `descriptor` siblings — does **not** wrap `send_to_model` in `try/except`.

So a single conversation whose extraction throws propagates the exception up
through the loop and **kills the batch**. Because `metadata.extracted` is set
only on success, that conversation is re-selected on the next session start,
throws again, and every conversation behind it is never processed. The failure
is silent (maintenance runs in the background), compounding (the backlog grows),
and wasteful (a doomed LLM call is spent every run).

This violates two CV9.E2 stabilization principles: *never silently corrupt
semantic state* and *fail cleanly at the boundary*.

---

## Scope

- **Per-conversation isolation** in both loops (`try/except` + continue): one
  failure cannot crash the batch or block the queue behind it.
- **Retry budget + quarantine:** an `extraction_attempts` counter in the
  conversation `metadata` JSON; after `EXTRACTION_MAX_ATTEMPTS` (default 3,
  env-overridable) the conversation is flagged `extraction_quarantined`.
- **Queue exclusion:** quarantined conversations drop out of
  `get_unextracted_conversations()` so they stop being retried and stop
  burning LLM calls.
- **Finalize-on-failure:** `end_conversation` finalizes non-manual metadata
  even when extraction throws (today the finalize step is skipped on failure);
  the orphan is still closed because `ended_at` is set before extraction.
- **Visibility:** the session-maintenance report names the quarantine count
  (`⚠ N conversation(s) quarantined after repeated extraction failure`) so the
  failure is no longer invisible.

---

## Non-goals

- **No schema change.** The counter and flag live in the existing
  `conversations.metadata` JSON, consistent with `extracted` / `title_status`.
- **No extraction idempotency work.** Partial-failure duplication is
  [AI-03](../../../../ai-engineering-audit.md), the next story; it is not pulled
  in here (WIP discipline).
- **No `runtime diagnose` finding.** The audit accepts *diagnose or
  session-maintenance line*; the maintenance line satisfies it. A diagnose
  finding is a cheap follow-up.
- **No change to the ≥4-messages / journey-required extraction guard** (that is
  [AI-21](../../../../ai-engineering-audit.md)).

---

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [AI Engineering Audit — AI-02](../../../../ai-engineering-audit.md)
- [CV9.E2 — Stabilization & Robustness](../index.md)
