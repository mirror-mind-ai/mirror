[< Story](index.md)

# Test Guide — CV22.DS5.US2

## Automated Validation

- Run automated tests that cover the planned behavior.
- Provide a Navigator-visible route with expected observation, pass condition, and fail condition.

## E2E Decision

required unless Navigator explicitly accepts a narrower fixture-level validation route

## Navigator Validation

Provide the Navigator-visible route with expected observation, pass condition, and fail condition before the story can pass Validation.

## Validation Evidence

Implementation checks run locally:

```bash
cd ts
npm run typecheck
npm run lint
npm test
npm test -- test/extraction/*.test.ts test/conversation/*.test.ts test/providers/*.test.ts
cd ..
git diff --check
rg 'Authorization: Bearer|OPENROUTER_API_KEY|api_key|apiKey|secret|token' ts/test ts/src
```

Result:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 203 tests.
- Focused extraction/conversation/provider command: passed.
- `git diff --check`: passed.
- Secret/payload grep showed only schema `token_count`, fake test secrets, redaction patterns, and unrelated token wording; no real provider credential, raw provider payload, or private transcript fixture is committed.

Implemented evidence:

- `ReplayLlmProvider` supplies deterministic role-keyed responses without network.
- Extraction parser covers raw/fenced JSON, malformed responses, memory defaults/backfills, task parsing, and curation fail-open behavior.
- `runConversationExtraction` enforces Python guards, persists replayed memories/tasks/summary/embeddings/metadata on DB copies, supports optional two-pass curation, and swallows task extraction failures.
- `ts/src/frontDoor/routing.ts` was not changed; runtime extraction cutover remains deferred to `CV22.DS5.US4`.
