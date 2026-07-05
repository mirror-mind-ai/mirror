[< Story](index.md)

# Plan — CV22.DS2.US1 `search` Command Parity

## Pull

Pulled at User Story level. This is the first real command-parity slice after the DS2 foundation stories. It closes Alisson's current baton block by moving `search` from spike proof into the durable TS core.

The current runtime cursor is already positioned at `CV22.DS2.US1` with a pending Navigator approval checkpoint. This artifact materializes the missing plan so the checkpoint can be reviewed before implementation begins.

## Prepare

DS1 proved that the hybrid ranker can be reproduced in TypeScript over the same SQLite seam. DS2.TS1 created the real `ts/` package and `node:sqlite` driver seam. DS2.TS2 created the synthetic golden-corpus generator and verifier, but its TS side currently verifies the contract mechanics rather than replaying the full ranker.

This story turns that substrate into actual search parity. The key move is to promote the spike behavior into durable modules while extending the golden corpus with every input the ranker needs to replay Python's result: lexical text, use/relevance/access signals, timestamps, embeddings, weights, frozen `now`, frozen query embedding, and MMR configuration.

The hard boundary remains unchanged: this is core parity only. No Pi front door, no live command routing, no fresh OpenAI embedding path, no writes, and no production DB mutation.

## Scope

- Add durable TS search/ranker modules under `ts/src/`, separated from tests and spike code.
- Extend `ts/parity/generate_golden.py` so each golden memory includes the fields required by full ranking replay:
  - `content` or equivalent lexical surface,
  - `created_at` and `created_at_ms`,
  - `last_accessed_at` and `last_accessed_at_ms`,
  - `use_count`,
  - `relevance_score`,
  - `access_count`,
  - embedding BLOB and decoded embedding reference.
- Implement TS ranking behavior equivalent to Python `MemorySearch.search` for the committed synthetic corpus:
  - cosine semantic score,
  - recency with frozen `now`,
  - reinforcement from use count and retrieval/access signal,
  - manual relevance score,
  - ordinal lexical score derived from FTS/bm25 ordering or an explicitly captured equivalent ordering in the synthetic fixture,
  - score sort with stable ordering consistent with Python,
  - MMR deduplication,
  - limit handling.
- Keep the verifier's success metric as exact ordered-id equality.
- Add focused `node:test` coverage for scoring helpers and end-to-end synthetic parity.
- Preserve the DS2.TS1 driver-seam rule: only the DB seam imports `node:sqlite`.
- Document the manual real-DB-copy parity route in `test-guide.md`.

## Non-Goals

- Do not route `/mm-search` or any CLI/runtime call to TS yet.
- Do not implement fresh embedding generation or call OpenAI from TS.
- Do not port `detect-persona`, journey listing, memory listing, writes, extraction, consult, or MCP surfaces.
- Do not change SQLite schema, FTS5 tables, tokenizer behavior, Python ranking semantics, or public command output.
- Do not commit or mutate a real production `memory.db`.

## Implementation Approach

1. Read Python `MemorySearch.search` and the DS1 spike side by side, then identify the exact behavior that must become durable TS code.
2. Extend the golden schema first, regenerate the synthetic fixture, and update TS fixture types. This should fail until the TS ranker consumes the new fields.
3. Implement small TS helper modules for parsing/time, cosine, scoring signals, lexical score input, ranking, and MMR deduplication. Reuse existing `blobToFloat32` and `parseUtcMs` where possible.
4. Update the golden verifier to call the TS ranker and compare ordered ids to `expected_order`.
5. Add focused unit tests around edge cases that could silently drift: empty embeddings, null timestamps, access count with missing last access, zero vectors, lexical ordering, and MMR near-duplicate removal.
6. Run the automated validation suite from `ts/` and the generator determinism check from repo root.
7. Run or prepare the manual real-DB-copy parity route. If a safe real DB copy is available, execute selected probes and record evidence. If not, leave the route explicit and mark manual parity as pending Navigator validation rather than pretending it passed.

## Test Strategy

Automated checks:

```bash
cd ts
npm run typecheck
npm run lint
npm test

cd ..
uv run python ts/parity/generate_golden.py
git diff --exit-code ts/test/goldens/
```

Additional structural checks:

```bash
rg 'node:sqlite' ts/src
```

Expected structural result: only `ts/src/db/database.ts` imports `node:sqlite` in production TS source.

Manual real-DB-copy parity:

- Create a safe copy of the production `memory.db` outside committed paths.
- Run Python search for selected probes against the copy.
- Run the TS ranker/search parity harness against the same copy.
- Compare ordered ids at the selected limit.
- Delete or keep the copy only in ignored local storage. Never commit it.

## E2E Decision

E2E through a runtime is **not required** for this story because no runtime route changes. The relevant validation is command-core parity over synthetic fixtures plus manual real-DB-copy parity. Runtime dogfooding starts in CV22.DS3.

## Risks And Controls

False parity can appear if the synthetic corpus does not contain enough ranker signals. Control: extend the corpus with reinforcement, relevance, access, lexical, recency, semantic, and MMR cases.

False mismatch can appear if wall-clock time leaks into either side. Control: frozen `now` remains a required golden input.

Score-level differences can distract from real parity. Control: compare ordered ids, while keeping score diagnostics available only for debugging.

Production data can leak or be mutated during real-DB validation. Control: use a database copy, ignore local artifacts, and keep committed fixtures synthetic.

## Validation Route

Pass condition: automated checks are green, generator regeneration is deterministic after the intentional schema update, `node:sqlite` remains isolated to the DB seam in production TS source, and manual real-DB-copy parity either passes with recorded probes or is explicitly marked as the remaining Navigator validation gate.

Fail condition: any ordered-id mismatch on synthetic corpus, non-deterministic fixture regeneration, new direct `node:sqlite` import outside the seam, or any need to change ranking semantics rather than port them.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
