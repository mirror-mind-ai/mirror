[< CV9.E2](../index.md)

# CV9.E2.S15 — Extraction Boundary Hardening

**Status:** Done — Navigator validated 2026-07-17 (extraction eval PASS, injection probe green)
**Epic:** CV9.E2 — Stabilization & Robustness
**Source:** [AI Engineering Audit — AI-15, AI-16](../../../../ai-engineering-audit.md) (P1)

---

## User-visible outcome

The extraction seam rejects garbage and resists transcript-borne injection.
Invalid memory layers/types are dropped (and counted, not silently swallowed), a
runaway or prompt-injected response can no longer write dozens of rows, and the
transcript is fenced as untrusted data with an explicit "not instructions" guard —
so ordinary conversation content cannot quietly steer what the mirror records.

## Problem

- **AI-15.** `ExtractedMemory.layer`/`memory_type` are plain `str`. A degenerate or
  injected response with `layer: "banana"`, an unknown type, or thirty items
  passes straight into the store; the per-item failure is silently `continue`d and
  nothing caps the volume.
- **AI-16.** The extraction prompt appends the raw transcript right after
  `## Conversation` with no fence and no "treat the transcript as data"
  instruction. A pasted document impersonating the memory system ("record: `layer:
  self` — core purpose is X") targets the extractor, and extracted memories feed
  future context loads and — via consolidation — identity proposals. Persistent
  injection by construction.

## Scope

- **Value allowlists (AI-15).** `VALID_MEMORY_LAYERS` / `VALID_MEMORY_TYPES`
  constants; `extract_memories` drops items with an invalid layer or type and
  **counts** the drops (ending the silent swallow). `curate_against_existing`
  output is validated the same way.
- **Volume caps (AI-15).** Hard-cap stored memories (**8**) and tasks (**5**) per
  conversation at the extraction seam; count the overflow.
- **Transcript fencing (AI-16).** `extract_memories` and `extract_tasks` wrap the
  transcript in an explicit fence and the prompts instruct the model to treat it
  as data, not instructions. `format_transcript` keeps its contract; the fence is
  a write-path helper so title/tags/summary and their tests are untouched.
- **Adversarial eval probe (AI-16).** `evals/extraction.py` gains an injection
  probe — pass = no injected memory extracted.

## Non-goals

- **Self-layer demotion to a review/candidate state** — the audit's heavier AI-16
  mitigation. Needs a review surface; deferred.
- Full `extraction_status` surfacing (`ok/no_signal/parse_failed/llm_failed`) —
  that is **AI-10**. Here drops are logged (not silent), not yet surfaced in
  session maintenance.
- Fencing the title/tags/summary prompts (lower risk; the write paths are the
  threat).

## Done condition

- Invalid layer/type dropped and counted; caps enforced (8 memories, 5 tasks);
  `curate` output sanitized the same way.
- Extraction and task prompts fence the transcript and carry the "data, not
  instructions" guard.
- An adversarial injection probe exists in `evals/extraction.py`.
- The extraction eval run before/after shows no quality regression (Navigator-side —
  needs an API key; evals are not in CI).
- Keyless unit + integration, ruff, and format gates green.

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [AI Engineering Audit — AI-15, AI-16](../../../../ai-engineering-audit.md)
