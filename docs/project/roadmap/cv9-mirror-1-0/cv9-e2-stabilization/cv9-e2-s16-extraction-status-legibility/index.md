[< CV9.E2](../index.md)

# CV9.E2.S16 — Extraction Status Legibility

**Status:** Done — Navigator validated 2026-07-17 (keyless smoke: status recorded + maintenance line)
**Epic:** CV9.E2 — Stabilization & Robustness
**Source:** [AI Engineering Audit — AI-10](../../../../ai-engineering-audit.md) (P1)

---

## User-visible outcome

A conversation the mirror **failed to read** is no longer indistinguishable from
one with **nothing worth keeping**. Each extracted conversation records an
`extraction_status` (`ok | no_signal | parse_failed | llm_failed`) and any
dropped-item counts, and session maintenance surfaces a `⚠` line when
conversations produced unreadable model output — so silent memory loss becomes
visible instead of looking like a quiet, empty success.

## Problem

`extract_memories` returns `[]` for **both** a malformed-JSON response
(`parse_failed`) and a genuinely empty one (`no_signal`), and LLM failures raise
into a path that only counts attempts. A conversation full of decisions that the
model mangled into unparseable output leaves no memory and no signal — on a
product whose promise is memory, that deserves explicit state.

## Scope

- **`extraction_status` in conversation metadata** — `ok | no_signal |
  parse_failed | llm_failed`, recorded on every conversation that runs
  extraction. `parse_failed`/`no_signal` are distinguished via a
  backward-compatible status sink on `extract_memories`; `llm_failed` is set in
  the existing exception path (which still re-raises, preserving S7 quarantine).
- **`extraction_dropped` counts in metadata** — the invalid-layer / invalid-type
  / over-cap counts CV9.E2.S15 already computes, finally surfaced per
  conversation.
- **Session-maintenance surface** — a store count of `parse_failed` conversations
  and a `⚠ N conversation(s) with unreadable model output` line, mirroring S7's
  quarantined line.

## Non-goals

- The optional **`parse_failed` repair retry** ("Return ONLY valid JSON") — the
  audit says measure its cost first (via the AI-09 ledger). Deferred.
- Task-extraction status (tasks already fail soft separately; memory is the
  promise).
- Web/console rendering of the status (textual maintenance line only for now).

## Done condition

- Metadata records `ok`/`no_signal`/`parse_failed`/`llm_failed` on the matching
  paths, plus `extraction_dropped` when items were dropped.
- `llm_failed` still raises and quarantines per S7; a successful retry overwrites
  it with the final status.
- `session_maintenance` prints the `⚠` line when `parse_failed` conversations
  exist.
- Existing mocked service tests pass unchanged (sink-empty fallback).
- Keyless unit + integration, ruff, and format gates green.

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [AI Engineering Audit — AI-10](../../../../ai-engineering-audit.md)
