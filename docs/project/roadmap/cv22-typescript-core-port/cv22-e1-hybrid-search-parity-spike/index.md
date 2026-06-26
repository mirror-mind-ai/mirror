[< CV22](../index.md)

# CV22.E1 — Hybrid-Search Parity Spike

**Status:** ✅ Done
**Goal:** Prove the riskiest assumption of the TypeScript port before committing to it — that a TypeScript reimplementation of Mirror's hybrid search, reading the **same SQLite file**, reproduces the Python ranker's ordered results, on synthetic data and on a real-database snapshot.

---

## Why this epic came first

The strangler bets that a TS core can replicate Mirror's subtlest behavior. The
hybrid ranker is the subtlest piece: semantic similarity + recency decay + honest
reinforcement + manual relevance + ordinal lexical (bm25) + MMR deduplication. If
parity holds here, the hard part of the migration is de-risked; if it fails, the
whole approach needs rethinking. A parity spike's first job is not writing
TypeScript — it is **characterizing the oracle**, the Python ranker in
`src/memory/intelligence/search.py`.

## What was built

A throwaway harness under [`spikes/ts-search-parity/`](../../../../../spikes/ts-search-parity/):

- `generate_golden.py` / `generate_golden_real.py` — drive the **real**
  `MemorySearch.search` as the oracle (not a re-derivation), with the two
  non-deterministic inputs frozen, and emit a golden corpus.
- `parity.ts` / `parity_real.ts` — reimplement only the scoring math in
  TypeScript over the **same** SQLite file (`node:sqlite`), and compare ordered
  results to the golden.

The real-DB harness snapshots a copy of `memory.db` read-only via SQLite's backup
API; the live file is never opened for write. The snapshot and golden artifacts
are git-ignored — they contain personal memory data and are never committed.

## Results

| Run | Data | Probes | Order parity | Worst score Δ |
|-----|------|--------|--------------|---------------|
| Synthetic | 8 seeded memories, 8-dim | 1 | ✅ identical | `3.16e-8` |
| Real-DB | 480 real memories, 1536-dim | 8 | ✅ identical (all) | `7.20e-8` |

The real run's tightest agreeing adjacent ranking gap was `1.275e-4` — a
**~1,700×** margin over the worst numerical divergence (`7.2e-8`). The float
difference is three orders of magnitude below the closest real decision, so it
cannot flip a real near-tie. Boundary in/out flips are caught by the id
comparison and did not occur.

## Findings (carried into CV22 and the decision record)

- **The ranker is not pure** — `recency` and `reinforcement` depend on
  `datetime.now()`; the golden contract must **freeze `now`**.
- **Lexical is ordinal** — bm25 *ordering* parity is required, not bm25 *value*
  parity.
- **FTS5 is free** — TS queries the shared `memories_fts` table and reimplements
  no tokenizer/bm25 logic (database-as-seam payoff).
- **No native build** — `node:sqlite` (FTS5 + bm25) and direct `.ts` execution
  remove the toolchain risk.
- **Success metric = ordered ids**, not bit-identical scores (float32 numpy vs
  float64 JS).

## Residual gaps (not in scope for E1)

1. **Live embedding path** — probes used stored embeddings as query vectors,
   valid for *ranker* parity but not exercising the `query → OpenAI embedding →
   search` path with a fresh embedding. → CV22.E5.
2. **Writes** — `log_access` was stubbed for read-only parity. → CV22.E4.
3. **Scale** — 480 memories is small; the ranker is a full scan + cosine per row.
   A performance question (both languages), separate from parity.

## References

- Harness: [`spikes/ts-search-parity/`](../../../../../spikes/ts-search-parity/)
- Oracle: `src/memory/intelligence/search.py`, `src/memory/storage/memories.py`
- [CV22 index](../index.md) · [Decisions — database-seam strangler](../../../decisions.md)
