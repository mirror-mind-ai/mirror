[< CV9.E2](../index.md)

# CV9.E2.S11 — Reinforcement Signal Integrity

**Status:** Done — Navigator validated 2026-07-16
**Epic:** CV9.E2 — Stabilization & Robustness
**Source:** [AI Engineering Audit — AI-12](../../../../ai-engineering-audit.md) (P0)

---

## User-visible outcome

Retrieval reinforcement reflects only genuine context loads. Internal machinery
— the extraction curation pass, MCP agent searches, and exploratory
`memories --search` runs — no longer inflates `access_count` and biases future
ranking. The ranker stops learning from its own exhaust.

---

## Problem

`MemorySearch.search()` calls `store.log_access()` for every returned memory,
unconditionally. `access_count` (rows in `memory_access_log`) feeds
`reinforcement_score`, which feeds the hybrid ranking. So **every** search
reinforces — including callers that are not a genuine "memory injected into a
context the mirror uses":

| Caller | Kind | Reinforce? |
|--------|------|-----------|
| Builder context load (`build load`) | memory injected into a real session context | Yes |
| TWO_PASS curation (`conversation.py`) | internal per-candidate dedup search | No |
| MCP `search_memories` | any connected agent querying | No |
| `memories --search` (CLI) | human browsing | No |

A batch curation run or a chatty MCP agent permanently biases retrieval — the
exact corruption the honest use/access split was built to prevent, reintroduced
through the side door. The MCP module docstring also claims "No writes/mutations
live here" while its search writes access rows — a contract inconsistency.

---

## Scope

- Add `log_access: bool = True` to `search()` / `search_with_status()` and thread
  it through `MemoryService` and `MemoryClient`. The log loop runs only when
  `log_access` is true.
- Opt out the three non-genuine callers: curation, MCP `search_memories`, and
  `memories --search` pass `log_access=False`. Builder context keeps the default
  `True`.
- Restore the MCP docstring's accuracy (search no longer reinforces).

---

## Non-goals

- **No `source` column** on `memory_access_log` (the audit's longer-term item).
  `access_context` is unchanged; after the fix only genuine loads log, so
  source-tagging is lower value now.
- **No explicit MCP `reinforce` tool argument** — agent search simply does not
  reinforce.
- No change to the reinforcement math or ranker weights.

---

## Done condition

- `search(log_access=False)` writes no access rows; the default still reinforces.
- Curation, MCP search, and CLI search do not reinforce; Builder context does.
- Full unit + integration suite (keyless), ruff, and mypy gates green.

---

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [AI Engineering Audit — AI-12](../../../../ai-engineering-audit.md)
