[< CV9.E2.S10](index.md)

# CV9.E2.S10 — Plan

**Status:** Approved — Navigator confirmed 2026-07-16 (fallback everywhere +
marker in `memories --search`; MCP/context markers deferred)

---

## Design

### models.py

```python
class SearchOutcome(NamedTuple):
    results: list[SearchResult]
    degraded: bool
```

### embeddings.py

Guard `generate_embedding` like `send_to_model`:

```python
if not OPENROUTER_API_KEY:
    raise RuntimeError("OPENROUTER_API_KEY is not configured.")
```

### search.py — `MemorySearch`

`search_with_status()` holds the real logic; `search()` becomes a thin delegator
returning `.results` (backward compatible).

```python
try:
    query_embedding = generate_embedding(query)
except Exception:
    query_embedding, degraded = None, True
...
for mem in all_memories:
    if mem.embedding is None:
        continue
    if degraded and mem.id not in fts_lookup:
        continue                      # lexical-only: FTS matches only
    emb = bytes_to_embedding(mem.embedding)
    sem = 0.0 if query_embedding is None else cosine_similarity(query_embedding, emb)
    ... hybrid_score(sem, rec, reinf, relevance) + lexical_weight * fts ...
# candidates.sort / mmr_dedupe (uses stored embeddings) / log_access — unchanged
return SearchOutcome(results, degraded)
```

Restricting to FTS-matched candidates in degraded mode avoids returning
recency-ranked non-matches (which the semantic term would normally rank); the
marker makes an empty result read as "no keyword matches", not "no memories".

### memory.py / client.py

Add `search_with_status` delegators; keep `search`.

### cli/memories.py

Use `search_with_status`; print
`⚠ Degraded: lexical-only search (embedding unavailable — offline or no API key).`
when `degraded`, for both the results and the no-results branches.

## Risks

- **Behavior change to `generate_embedding` (no-key guard).** Callers get a
  clear `RuntimeError` instead of an opaque 401 — an improvement, not a
  regression; extraction already handles embedding failures (S7/S9) and unit
  tests mock the call.
- **Ranker subtlety.** Degraded scoring drops only the semantic term and filters
  to FTS matches; normal-mode scoring is untouched. Covered by a normal-mode
  regression test.

## Verification

Full CI gate plus the story tests in [test-guide.md](test-guide.md).
