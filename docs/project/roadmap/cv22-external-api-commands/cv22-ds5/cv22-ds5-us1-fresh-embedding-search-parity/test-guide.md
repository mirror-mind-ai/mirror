[< Story](index.md)

# Test Guide — CV22.DS5.US1

## Automated Validation

From the repository root:

```bash
cd ts
npm run typecheck
npm run lint
npm test
cd ..
git diff --check
```

Expected result:

- Typecheck passes.
- Biome check passes.
- Full TS test suite passes.
- Whitespace check passes.
- No test requires live OpenRouter credentials or network access.

## Focused Validation

After implementation, run the focused TS search/provider/parity subset:

```bash
cd ts
npm test -- test/search/*.test.ts test/providers/*.test.ts test/parity/*.test.ts
```

Expected result:

- Replay embedding provider returns deterministic query vectors.
- TS memory-search composition ranks against replayed embeddings.
- Filters, lexical scores, grouped access counts, MMR integration, and access logging are covered.

## Parity Validation

Use a generated demo DB or copied DB under ignored `tmp/` storage.

Expected route:

```bash
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
# command may be extended during implementation, but must stay copy-safe and redacted
uv run python ts/parity/real_db_copy_parity.py --source-db tmp/parity/demo-memory.db
```

Expected observation:

- Python oracle and TS fresh-search composition consume the same replayed/frozen query embedding.
- Ordered result ids match.
- Grouped TS access counts match Python per-id counts for every candidate.
- TS copy receives `logAccess` side effects only after result selection.
- Evidence remains redacted by default.

## Navigator Validation

Route:

1. Inspect the implementation files for provider/search separation.
2. Confirm `ts/src/frontDoor/routing.ts` did not route `memories --search` to TS in this story.
3. Run automated validation commands.
4. Inspect parity evidence from the demo/copy DB route.
5. Confirm no real provider payloads, API keys, private queries, raw memory content, or production DB artifacts were committed.

Expected observation:

- TS can execute the fresh semantic search core using replayed provider embeddings.
- Python-compatible ordered results are proven on fixture/demo data.
- Access logging happens on DB copies with query context truncated to 200 chars.
- Runtime command cutover is still deferred to US4.

Pass condition:

- Automated checks pass.
- Parity route passes with redacted evidence.
- Grouped access-count parity is proven.
- No live provider credentials are required in CI.
- No front-door route is changed.

Fail condition:

- Ordered ids diverge without an explained and accepted semantic difference.
- Grouped access counts do not match Python per-id counts.
- A live provider call is required for CI.
- Production DB mutation or private fixture leakage occurs.
- `memories --search` routing changes before US4.

## Validation Evidence

Implementation checks run locally:

```bash
cd ts
npm run typecheck
npm run lint
npm test
cd ..
git diff --check

cd ts
npm test -- test/search/*.test.ts test/providers/*.test.ts test/parity/*.test.ts
cd ..
rg 'Authorization: Bearer|OPENROUTER_API_KEY|api_key|apiKey|secret|token' ts/test ts/src
```

Result:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 193 tests.
- `git diff --check`: passed.
- Focused search/provider/parity test command: passed.
- `rg` inspection showed intentional implementation/test strings, fake test
  secrets, redaction patterns, and unrelated uses of the words token/secret; no
  real provider credential or private provider payload was present.

Implemented evidence:

- `ReplayEmbeddingProvider` returns deterministic query embeddings without
  network.
- `searchMemories` composes replayed embeddings, DB memory rows, FTS lexical
  scores, grouped access counts, the existing TS ranker, and `logAccess`.
- Tests prove grouped access counts match Python's per-id COUNT semantics for
  present and zero-count memory ids.
- Tests prove returned memories receive `logAccess` side effects with query
  context truncated to 200 characters.
- `ts/src/frontDoor/routing.ts` was not changed; runtime cutover remains deferred
  to `CV22.DS5.US4`.
