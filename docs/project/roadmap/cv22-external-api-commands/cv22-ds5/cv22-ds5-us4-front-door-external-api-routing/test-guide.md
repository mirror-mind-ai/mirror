# Test Guide — CV22.DS5.US4 Front-Door External-API Routing And Dogfood

## Purpose

Validate that the TypeScript front door routes only approved DS5 external-API command surfaces, preserves Python fallback for unsafe/unported paths, and can be dogfooded with replay/copy-safe configuration without live credentials.

## Required Automated Checks

```bash
cd ts
npm run typecheck
npm run lint
npm test
npm test -- test/frontDoor/*.test.ts test/consult/*.test.ts test/search/*.test.ts test/providers/*.test.ts
cd ..
git diff --check
rg 'Authorization: Bearer|OPENROUTER_API_KEY|api_key|apiKey|secret|token|prompt|context' ts/test ts/src
```

Adjust focused globs if implementation uses different final test paths.

## Expected Coverage

- `memories --search` routes through TS only under the approved DS5 route contract.
- `consult credits` and `consult <family> ...` route through TS only under the approved DS5 route contract.
- Unknown/unvalidated extraction lifecycle commands remain Python fallback unless a narrow route is explicitly implemented and validated.
- Replay/copy-safe front-door dogfood exercises routed search/consult without network.
- Missing provider config/unsafe fixtures produce redacted actionable behavior.
- Front-door logs remain metadata-only and do not contain prompt/query/context/provider payloads/secrets.
- Search access-log side effects are backup-gated in live mode and copy-only in tests.

## Navigator Validation

Pass if:

- All required checks pass.
- Routed command list is narrow and documented.
- Replay/copy-safe dogfood proves TS routes work without live credentials.
- Python fallback remains for unsafe/unported paths.
- No private prompts, Mirror context, provider payloads, production DB artifacts, or credentials are committed.

Fail if:

- CI needs live provider credentials/network.
- Any unvalidated external/API command routes to TS.
- Secrets/private payloads can appear in logs, errors, fixtures, or commits.
- Live DB mutation can happen without backup gating.

## Validation Evidence

Implementation checks run locally:

```bash
cd ts
npm run typecheck
npm run lint
npm test
npm test -- test/frontDoor/*.test.ts test/consult/*.test.ts test/search/*.test.ts test/providers/*.test.ts
cd ..
git diff --check
rg 'Authorization: Bearer|OPENROUTER_API_KEY|api_key|apiKey|secret|token|prompt|context' ts/test ts/src
```

Result:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 214 tests.
- Focused frontDoor/consult/search/provider command: passed.
- `git diff --check`: passed.
- Secret/prompt/context grep showed intentional implementation fields, fake test secrets, schema names (`token_count`, `access_context`), redaction/config patterns, and synthetic test context only; no real provider credential, private prompt/context, live provider payload, or production DB artifact is committed.

Implemented evidence:

- `routeMemoryCommand` now routes DS5 external commands to TS only when `MIRROR_TS_EXTERNAL_ROUTES=1` and replay-safe fixture configuration is present.
- `memories --search` executes through the TS front door with replayed embeddings, backup-gated write access, compatible search rendering, and access-log side effects.
- `consult credits` and `consult <family> ...` execute through the TS front door with replayed credits/LLM fixtures and Python-compatible rendering.
- Unknown/unvalidated/extraction lifecycle commands remain Python fallback.
- Front-door log tests prove metadata-only logging; search query text is not logged.
