# Plan — CV22.DS5.US4 Front-Door External-API Routing And Dogfood

## Objective

Route validated DS5 external-API command surfaces through the TypeScript front door under explicit safe/live gates, while preserving Python fallback for unsafe, unconfigured, or still-unported paths. Validate with replay/copy-safe automated tests and optional manual live dogfood only when credentials/configuration are explicitly present.

## Current State

Validated TS cores exist for DS5:

- `CV22.DS5.US1`: fresh semantic search core (`ts/src/search/memorySearch.ts`) with replayed embeddings and DB-copy access logging.
- `CV22.DS5.US2`: conversation extraction core (`ts/src/conversation/extraction.ts`) with replayed LLM/embedding providers and DB-copy persistence.
- `CV22.DS5.US3`: consult core (`ts/src/consult/*`) with replayed LLM, credits, and generation-cost seams.

Current front-door state:

- `ts/src/frontDoor/routing.ts` still routes `memories --search` to Python with reason `fresh semantic search remains Python until CV22.DS5`.
- `consult`, extraction lifecycle commands, and other external/API paths still fall through to Python.
- Existing live-write TS routes (`identity set`, `journey set-path`) use backup-gated write seams.
- Existing read routes self-heal missing DBs by falling back to Python.

## Routing Contract

Implement routing narrowly and explicitly. Do not turn on broad external API routing by accident.

### Route to TS

1. `memories --search <query>`
   - Route through TS only when the external search path can construct a provider safely.
   - Use env/config-only credentials for live provider mode.
   - Allow replay mode for CI/dogfood validation without network.
   - Because search logs access, live mode must use the sanctioned live-write seam with backup gating; replay/copy tests must use copy DBs.

2. `consult credits`
   - Route through TS when credits provider is available.
   - CI uses replay provider.
   - Missing live `OPENROUTER_API_KEY` should produce an actionable TS error or fall back by policy, but must not expose secrets.

3. `consult <family> [tier] <question> ...`
   - Route through TS when context loading and provider seams are available.
   - Load Mirror context in a Python-compatible way, but keep context out of logs.
   - CI uses injected/replay context/provider fixtures.
   - Live provider mode is optional/manual and env-gated.

### Preserve Python fallback

Keep Python fallback for:

- Conversation extraction lifecycle routes (`conversation_logger`, `extract-pending`, stale session closing, etc.) unless a route is explicitly safe, tested, and backup-gated in this story.
- Any external call path without safe config/replay provider.
- Any unknown command or command family not validated in DS5.
- Any schema drift or missing DB self-heal case already handled by Python fallback.

If extraction routing is touched at all, it must be limited to a clearly named copy/replay harness path, not daily live extraction lifecycle. Otherwise, document that extraction has TS core parity but remains fallback pending a future dedicated lifecycle routing slice.

## Implementation Scope

Likely files:

```text
ts/src/frontDoor/routing.ts              # DS5 route decisions and fallback reasons
ts/src/frontDoor/cli.ts                  # dispatch handlers for routed DS5 commands
ts/src/frontDoor/externalProviders.ts    # provider construction from env/replay config
ts/src/frontDoor/consultRoute.ts         # consult command handler using TS core
ts/src/frontDoor/searchRoute.ts          # memories --search handler using TS core
ts/src/frontDoor/render/searchResults.ts # Python-compatible-ish search output if needed
ts/test/frontDoor/*                     # routing/dispatch/fallback/replay tests
ts/test/consult/*                       # existing consult tests extended if needed
ts/test/search/*                        # existing search tests extended if needed
```

Final file names may differ, but keep these seams:

- route decision separate from command execution;
- provider construction separate from business logic;
- live provider config separate from replay fixtures;
- renderers testable without network;
- logs and errors redacted.

## Provider / Configuration Rules

- API keys must be read from env/config only; never argv.
- Test/CI must not require live provider credentials or network.
- Support a replay mode for front-door tests, e.g. through a test-only injected provider seam or explicit fixture env variables. Do not require committing private transcripts/provider payloads.
- Live mode must redact configured secrets and bearer tokens from errors.
- Front-door logs must remain metadata-only: command, route, exit code, and safe detail category only. Never log prompts, query text, Mirror context, provider payloads, or credentials.

## Acceptance Behavior

```text
Given validated DS5 TS cores and replay provider fixtures
When the TS front door receives routed external-API commands under safe config
Then memories --search and consult run through TS and render compatible output
And unsafe, unconfigured, missing-DB, schema-drift, or still-unported paths preserve Python fallback/actionable errors
And CI requires no live provider credentials, network, private prompts, or production DB artifacts
```

## Test Plan

Automated tests should cover:

1. Routing decisions:
   - `memories --search` routes to TS with a DS5 reason.
   - `consult credits` routes to TS with a DS5 reason.
   - `consult <family> ...` routes to TS with a DS5 reason.
   - extraction lifecycle commands remain Python fallback unless explicitly implemented.
   - unknown commands remain Python fallback.
2. Front-door dispatch:
   - routed consult ask uses TS consult core and replay providers in tests.
   - routed consult credits uses TS credits renderer and replay provider in tests.
   - routed `memories --search` uses TS search core and replay embedding provider in tests.
3. Fallback/error behavior:
   - missing DB still falls back to Python where current contract requires it.
   - schema drift maps to exit 2 like existing TS routes.
   - missing live provider config yields actionable, redacted error/fallback according to implementation choice.
   - unsafe replay fixtures are rejected.
4. Safety:
   - front-door logs do not contain prompts, query text, context, `--content`, secrets, or provider payloads.
   - write-capable search side effects are backup-gated in live mode and copy-only in tests.
5. Dogfood evidence:
   - replay/copy-safe command invocation proves the TS front door can exercise the external-API route without live credentials.
   - optional manual live smoke may be recorded only as redacted evidence, never as committed payload.

## Validation Commands

Run from repo root unless noted:

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

The grep result must be inspected: expected matches are implementation patterns, fake test secrets, schema names, and intentional test wording only.

## E2E / Dogfood Decision

Required validation is replay/copy-safe front-door dogfood. Live provider smoke is optional/manual only and must be skipped when credentials are absent. If live smoke is run, record only:

- command family exercised;
- success/failure status;
- route was TS;
- no raw prompt/context/provider response/cost payload.

Do not commit live provider fixtures, raw private prompts, Mirror context, production DB artifacts, or credentials.

## Out of Scope

- Removing Python fallback.
- Routing unvalidated external/API command families.
- Broad conversation extraction lifecycle cutover unless explicitly proven safe and narrow in this story.
- Schema custody transfer or Python deletion.
- MCP/npm convergence or DS6 packaging.
- New consult/search/extraction product capabilities.
- Provider policy redesign.

## Navigator Validation Route

1. Inspect `ts/src/frontDoor/routing.ts` and DS5 front-door handlers.
2. Confirm routed commands are limited to validated DS5 surfaces and unsafe/unported paths still fallback.
3. Run validation commands.
4. Inspect front-door log tests and secret/prompt/context grep hits.
5. Run replay/copy-safe front-door dogfood command(s) produced by the implementation/test guide.
6. Optionally run live smoke only if the Navigator chooses and credentials are already configured.

## Pass Condition

- Automated checks pass.
- TS front door routes only approved DS5 surfaces.
- Replay/copy-safe dogfood proves `memories --search` and `consult` can execute through TS without network/credentials.
- Missing config/unsafe paths do not leak secrets and do not break Python fallback policy.
- No private prompt/context/provider payload/production DB artifact is committed.

## Fail Condition

- Any unvalidated external command is routed to TS.
- CI requires live provider credentials or network.
- Prompt, query, Mirror context, provider payload, or credentials appear in logs, fixtures, errors, or commits.
- Search side effects can mutate a live DB without backup gating.
- Python fallback is removed or narrowed outside the approved DS5 scope.
