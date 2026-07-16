# Plan — CV22.DS5.US1

## Objective

Port the fresh semantic memory-search core path to TypeScript behind the DS5 provider substrate, without front-door cutover yet. The user-visible command remains on Python until `CV22.DS5.US4`; this story makes the TS core capable of doing the same search work from `(query text + provider embedding + database rows) → ranked results + access logging`.

## Current Terrain

Python behavior lives in `src/memory/intelligence/search.py`:

1. `generate_embedding(query)` calls OpenRouter through `src/memory/intelligence/embeddings.py`.
2. `get_all_memories_with_embeddings()` loads embedded memories ordered by `created_at DESC`.
3. Optional filters apply in memory: `memory_type`, `layer`, `journey`.
4. `fts_search(query, ...)` provides ordinal lexical scores through FTS5/BM25.
5. Each candidate gets semantic, recency, reinforcement, relevance, and lexical score.
6. Results are sorted by score and MMR-deduped.
7. Returned memories are logged through `log_access(memory_id, context=query[:200])`.

TS already has:

- `ts/src/search/ranker.ts` — deterministic ranker replay over frozen query embeddings.
- `ts/src/memory/reinforcement.ts` — `logAccess` write parity.
- `ts/src/db/decode.ts` — embedding BLOB and timestamp decoding.
- `ts/src/providers/*` — DS5.TS1 config/redaction/replay substrate.

The missing piece is the **live-search composition layer** in TS: query embedding provider + DB read model + FTS lexical scores + grouped access counts + existing ranker + access logging.

## Scope

- Add a TS embedding provider boundary that can obtain a query embedding through:
  - replay fixture mode for tests/CI;
  - live OpenRouter mode only as an optional manual smoke path, not required by CI.
- Add a TS memory-search read model over the SQLite seam:
  - load embedded memory rows with required ranker fields;
  - apply `memoryType`, `layer`, and `journey` filters;
  - compute FTS ordinal lexical scores matching Python's `fts_search` behavior;
  - compute access counts using one grouped `GROUP BY memory_id` query.
- Add a parity probe proving grouped access counts equal Python per-id counts on a DB copy before the ranker consumes them.
- Compose fresh search in TS:
  - provider query embedding;
  - ranker config with current Python constants mirrored in TS;
  - ranked ids and scores;
  - `logAccess` for returned memories with `context=query.slice(0, 200)`.
- Add tests for replayed provider embeddings, filtering, lexical score ordering, grouped access counts, MMR/ranker integration, and access logging.
- Extend the redacted real-DB-copy parity harness if needed so a copied/demo DB can prove Python-vs-TS ordered ids under the same frozen/replayed query embedding.

## Non-Goals

- Do not route `memories --search` or other front-door commands to TS yet; that is `CV22.DS5.US4`.
- Do not port extraction or consult.
- Do not require live provider credentials in CI.
- Do not change ranker semantics, search weights, schema, FTS tokenizer behavior, or output formatting.
- Do not commit real OpenRouter responses, private queries, raw memory content, or production DB artifacts.

## Design Notes

A practical module shape:

```text
ts/src/providers/embedding.ts       # embedding provider interface + OpenRouter/replay adapters
ts/src/search/memorySearch.ts       # DB read model + composition over ranker/logAccess
ts/test/search/memorySearch.test.ts # fixture-level behavior tests
ts/parity/...                       # optional real/demo DB parity extension
```

The search composition should keep provider transport separate from search logic.
Search logic should accept an embedding provider interface so tests can inject replayed vectors without network.

The grouped access-count query is allowed by the CV22 decision "ports semantics, not query plans" only if parity proves the counts match Python's per-id count loop.

## Acceptance Behavior

```text
Given a database copy with embedded memories and access-log rows
And a replayed provider fixture for the query embedding
When TS fresh search runs with the same query, filters, ranker config, and frozen now as Python
Then the ordered result ids match the Python oracle
And returned memories receive access-log writes with context truncated to 200 chars
And no live provider call or credential is required in CI
```

```text
Given access counts computed by Python one memory id at a time
When TS computes access counts with a grouped aggregate query
Then the counts are identical for every candidate memory id
And the ranker consumes only the parity-proven grouped counts
```

```text
Given the user later routes `memories --search` through the front door
When the route is enabled in US4
Then this story's TS search core can be reused without changing provider safety, ranker semantics, or fallback policy
```

## Validation Route

Automated checks:

```bash
cd ts
npm run typecheck
npm run lint
npm test
cd ..
git diff --check
```

Focused checks expected after implementation:

```bash
cd ts
npm test -- test/search/*.test.ts test/providers/*.test.ts test/parity/*.test.ts
```

Parity route:

- Generate or copy a safe demo DB under ignored `tmp/` storage.
- Run Python oracle search with frozen/replayed query embeddings.
- Run TS fresh-search composition against a parallel DB copy using the same embedding fixture and frozen `now`.
- Compare ordered ids and verify access-log side effects on the TS copy only.
- Keep evidence redacted by default: labels, counts, hashes, pass/fail; no raw ids/content unless explicitly local debug.

## E2E Decision

Runtime E2E through `memories --search` is deferred to `CV22.DS5.US4`, because this story intentionally avoids front-door routing. Required validation here is core-level parity plus DB-copy side-effect validation. Optional live-provider smoke may be run manually if credentials are present, but it is not required for story closure.

## Risks And Controls

- **Provider nondeterminism:** use replay fixtures in automated tests; live smoke is optional/manual.
- **Access-count semantic drift:** prove grouped counts equal Python per-id counts before ranking.
- **Lexical mismatch:** reuse SQLite FTS5/BM25 over the shared DB; compare ordinal lexical scores, not raw BM25 values.
- **Accidental live DB mutation:** all parity/write validation runs on DB copies; no production DB proof.
- **Scope creep into routing:** keep front-door routing unchanged until US4.

## Stop Conditions

- A live provider call becomes necessary for CI.
- The implementation needs to alter Python search semantics.
- The grouped access-count strategy cannot prove parity on a copied DB.
- Front-door routing changes become necessary to validate the core search path.
- Real provider payloads or private DB artifacts would need to be committed.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
