# Spike: TypeScript ⇄ Python hybrid-search parity

Throwaway spike validating the riskiest assumption of the TypeScript port
([decision: database-seam strangler](../../docs/project/decisions.md)): a TS
reimplementation of Mirror's hybrid search, reading the **same SQLite file**,
reproduces the Python ranker's ordered results.

## Why this is the spike that matters

The strangler bets that a TS core can replicate Mirror's subtlest behavior. The
hybrid ranker (semantic + recency + honest reinforcement + manual relevance +
ordinal lexical + MMR dedup) is the subtlest piece. If parity holds here, the
hard part of the migration is de-risked.

## Findings

- **The ranker is not pure.** `recency` and `reinforcement` call
  `datetime.now()`, so the golden corpus must **freeze `now`** in both
  implementations. Captured in `inputs.json`.
- **Lexical is ordinal.** The score uses `1/(1+i)` over bm25 *order*, so TS needs
  bm25 ordering parity, not bm25 *value* parity.
- **FTS5 is free.** TS queries the same `memories_fts` table in the same file and
  reimplements zero tokenizer/bm25 logic — the database-as-seam payoff.
- **No native build.** Node's built-in `node:sqlite` runs FTS5 + bm25, and Node
  runs `.ts` directly.
- **Success metric = ordered ids, not bit-identical scores.** Python accumulates
  cosine in float32 (numpy), JS in float64; the delta lands ~1e-8 and does not
  change order.

## Run

```bash
# 1. Generate the fixture DB + frozen inputs + golden order from the REAL ranker
uv run python spikes/ts-search-parity/generate_golden.py

# 2. Reproduce in TypeScript over the same fixture.db, compare to golden
node spikes/ts-search-parity/parity.ts
```

`parity.ts` exits non-zero if the ranked order differs.

## Files

- `generate_golden.py` — drives the real `MemorySearch.search` as the oracle
  (frozen clock + frozen query embedding; `log_access` stubbed for read-only).
- `parity.ts` — TS reimplementation of the scoring math over the shared DB.
- generated (git-ignored): `fixture.db*`, `inputs.json`, `golden.json`, and any
  real-DB snapshot. **A real-DB snapshot must never be committed — it is personal
  memory data.**
