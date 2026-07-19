[< CV9.E2.S26](index.md)

# CV9.E2.S26 — Plan

## Problem

AI-05: `extract_pending()` processes every pending conversation with no cap. A backlog turns the next session start into a long, invisible, unbounded spend loop (≥2 LLM calls + up to ~9 embeddings per conversation, serially, for however many accumulated).

## Design

### Query-level cap (database-architect)

`get_unextracted_conversations(limit=None)` gets `ORDER BY c.ended_at ASC` (+ `LIMIT` when given) instead of an unbounded, unordered scan. A new `count_unextracted_conversations()` shares the exact same `WHERE` predicate (extracted as `_UNEXTRACTED_WHERE`) so the "carried over" count can never drift from what the capped fetch actually drew from — computed via `COUNT(*)` post-run, not by re-fetching or subtracting.

### Config knob (devops-engineer)

`MEMORY_MAINTENANCE_MAX_EXTRACTIONS`, default 10, via the existing `int(os.getenv(...))` pattern (same family as `MMR_DEDUP_THRESHOLD`, `REINFORCEMENT_DECAY_DAYS`). Documented in `docs/reference/configuration.md` matching the sibling `MEMORY_EXTRACTION_MAX_ATTEMPTS` entry's exact format.

### Report line, and the wording decision (ai-engineer + prompt-engineer)

`session_maintenance()` reports the carried-over count post-run whenever nonzero, using the existing `⚠`-consistent report scaffold. Wording is **"carried over"**, not "deferred" or "skipped" — both already claimed:
- `"skipped"` = AI-21's vocabulary for journey-less, never-extracted conversations.
- `"deferred"` = `session_start_fast`'s vocabulary for the *whole maintenance step* skipped to background (`"Maintenance deferred."`) — a different concept entirely, found while reading the adjacent code before writing tests.

"Carried over" is also literally the audit's own fix language ("carry the rest to the next run") — grounded, not invented.

## Team revisions from QA's plan

- **ai-engineer:** the visible carried-over count is the safety valve for a chronic backlog (>N eligible per session, sustained) — no escalation alarm needed; that's scope creep the count already covers.
- **database-architect:** shared `WHERE` fragment so count and fetch can't drift; oldest-first via SQL `ORDER BY`, not a Python slice, so SQLite can short-circuit; no index needed yet at local single-user scale.
- **devops-engineer:** config-only knob, trivially reversible, no migration; report line is the rollback-free observability that matters.
- **prompt-engineer:** recused (no instruction-text surface) but caught the one in-lane precision point — the "carried over" vs. "skipped" vocabulary collision.

## TDD

RED confirmed at each layer before implementing:
1. Storage: `limit`/ordering/quarantine-exclusion tests fail with `TypeError` (no `limit` param) / `AttributeError` (no `count_unextracted_conversations`).
2. CLI: cap/drain/override tests fail (`TypeError`, `AttributeError` on the config import, wrong counts).
3. Report: carried-over line absent until wired.

Then GREEN at each layer, in order: storage → config → CLI → report.

## Scope honesty

`(ended_at)` index and a chronic-backlog alarm are named, not built — no evidence either is needed yet.
