[< CV9.E2](../index.md)

# CV9.E2.S10 — Search Offline / No-Key Degradation

**Status:** Done — Navigator validated 2026-07-16
**Epic:** CV9.E2 — Stabilization & Robustness
**Source:** [AI Engineering Audit — AI-04](../../../../ai-engineering-audit.md) (P0)

---

## User-visible outcome

Memory search keeps working when the embedding provider is unreachable — no API
key, offline, or a timeout. Instead of crashing, it falls back to the local
FTS5 lexical index and tells the user the results are degraded (lexical-only).

---

## Problem

`MemorySearch.search()` calls `generate_embedding(query)` on its first line — a
hard network dependency with no guard (unlike `send_to_model`, which fails
clearly on a missing key). Offline, no-key, or a timed-out embedding call makes
every search path raise: `memories --search`, Builder/Mirror context injection,
and the MCP `search_memories` tool — even though a complete FTS5 index sits in
the same local database. A local-first product whose recall dies offline.

A detail that makes the fix cheap: the MMR dedup step ranks on the **stored**
memory embeddings, not the query embedding, so it is unaffected by a
query-embedding failure. Only the semantic-similarity term needs the query
vector.

---

## Scope

- **No-key guard.** `generate_embedding` raises a clear `RuntimeError` on an
  empty `OPENROUTER_API_KEY` (mirrors `send_to_model`) instead of an opaque 401
  after retries.
- **Graceful degradation.** `MemorySearch.search_with_status()` returns a
  `SearchOutcome(results, degraded)`. On any embedding failure it sets
  `degraded=True`, drops the semantic term (`sem = 0`), and restricts candidates
  to FTS-matched memories (true lexical-only). `search()` delegates and returns
  `.results` — every existing caller keeps working and stops crashing offline.
- **Marker rendering.** `memories --search` prints an explicit degraded line
  when the search fell back to lexical-only.

---

## Non-goals

- **MCP `search_memories` marker.** Surfacing `degraded` there means changing
  the tool's JSON shape (array → object); deferred to keep the contract stable.
  The crash-proof fallback still applies to MCP automatically.
- **Builder/Mirror context markers.** Context injection degrades silently to
  lexical (it still loads); a visible note there is a tracked follow-up.
- **No change to the hybrid ranker weights or MMR threshold.**

---

## Done condition

- An embedding failure yields FTS-ranked results with `degraded=True`, never an
  exception, across `search()` and `search_with_status()`.
- `generate_embedding` fails clearly on an empty key.
- `memories --search` renders the degraded marker.
- Full unit + integration suite, ruff, and mypy gates green.

---

## See also

- [plan.md](plan.md) · [test-guide.md](test-guide.md)
- [AI Engineering Audit — AI-04](../../../../ai-engineering-audit.md)
