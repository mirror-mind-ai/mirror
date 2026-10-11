# Plan — CV22.DS5.TS1

## Objective

Create the smallest safe TypeScript substrate for DS5 external-API work: provider
configuration, redaction, and deterministic record/replay fixtures. This story
must make later Fresh Search, Extraction, and Consult ports possible without each
command inventing its own secret-handling and test strategy.

## Current Terrain

Python external API use currently lives mainly in:

- `src/memory/intelligence/embeddings.py` — OpenRouter-backed embedding calls.
- `src/memory/intelligence/llm_router.py` — OpenRouter chat/generation/credits calls.
- `src/memory/intelligence/extraction.py` and conversation services — extraction orchestration using LLM responses.
- `src/memory/cli/consult.py` — consult command surface.

The TS core already has deterministic parity infrastructure under `ts/src/parity/`
and redacted front-door observability. DS5.TS1 should reuse that discipline rather
than introduce a parallel test world.

## Scope

- Add a TS provider-support module, likely under `ts/src/providers/`, with:
  - env/config-only API key lookup;
  - no argv-based secret ingestion;
  - explicit provider error types that redact sensitive values;
  - request/response fixture types suitable for embeddings and chat-like calls.
- Add a small redaction utility for:
  - `Authorization: Bearer ...` headers;
  - known secret env values such as `OPENROUTER_API_KEY`;
  - common secret-looking key names (`api_key`, `apiKey`, `authorization`, `token`, `secret`);
  - nested JSON objects and error messages.
- Add a deterministic record/replay fixture loader/writer contract:
  - replay mode reads committed scrubbed fixtures;
  - record mode is explicit and local-only, not the default CI path;
  - fixture validation rejects unsanitized authorization headers or configured secret values.
- Add focused tests proving:
  - secrets never come from argv;
  - redaction works on strings, headers, nested JSON, and errors;
  - fixture validation fails closed when a secret leaks;
  - replay returns deterministic fixture data without network access.
- Document the contract in the story test guide and, if implementation creates public contributor-facing conventions, update `ts/README.md` or `REFERENCE.md` only if needed.

## Non-Goals

- Do not port fresh semantic search (`CV22.DS5.US1`).
- Do not port extraction (`CV22.DS5.US2`).
- Do not port consult (`CV22.DS5.US3`).
- Do not route any new command through the TS front door (`CV22.DS5.US4`).
- Do not call live OpenRouter/Gemini/OpenAI in CI.
- Do not commit real provider payloads, private prompts, authorization headers, or user data.

## Design Notes

The first implementation should be deliberately small. It does not need a full
HTTP client abstraction for every future command if that would overfit. It does
need the invariants that future command ports will depend on:

1. secrets are configuration, never command arguments;
2. every diagnostic path has a redaction primitive available;
3. committed fixtures can be mechanically checked for leaks;
4. replay can be exercised in `node:test` without network or credentials.

A practical shape:

```text
ts/src/providers/config.ts        # env/config lookup, no argv secrets
ts/src/providers/redaction.ts     # redactString/redactJson/assertFixtureSafe
ts/src/providers/replay.ts        # load replay fixture + validate scrubbed shape
ts/test/providers/*.test.ts       # no-network deterministic tests
```

Names may change during implementation if a clearer seam appears, but the story
should stay at the substrate level.

## Acceptance Behavior

```text
Given a TS external-provider fixture containing scrubbed request/response data
When replay mode loads the fixture
Then deterministic provider data is returned without network access
And fixture validation proves no authorization headers or configured secrets leaked

Given a diagnostic string, JSON payload, or Error contains a secret-looking value
When it is passed through the redaction utility
Then the emitted value replaces the secret with a stable redaction marker

Given a caller attempts to provide an API key through argv-like inputs
When provider configuration is resolved
Then the provider boundary refuses that source and requires env/config instead
```

## Validation Route

Automated:

```bash
cd ts
npm run typecheck
npm run lint
npm test -- test/providers/*.test.ts
npm test
```

Repository hygiene:

```bash
git diff --check
rg 'Authorization: Bearer|OPENROUTER_API_KEY|api_key|apiKey|secret|token' ts/test ts/src
```

The `rg` command is not itself a pass/fail secret scanner; it is an inspection
step. Tests should carry the actual fixture-safety assertions.

## E2E Decision

Fixture-level validation is sufficient for this technical story. DS5.TS1 changes
no runtime command and should not require live-provider credentials. Live E2E
belongs to the child command stories after this substrate exists.

## Risks And Controls

- **Overbuilding a provider framework:** keep this to config, redaction, and replay.
- **False confidence from scrubbed examples:** add failing tests with deliberate leaked headers/secrets.
- **Secret leakage through error text:** redaction must handle plain strings and `Error.message`, not only JSON.
- **Fixture sensitivity drift:** keep fixture validation reusable so later DS5 stories run it on their committed fixtures.

## Stop Conditions

- The implementation requires choosing a full provider transport architecture for all of DS5.
- A live API call appears necessary to validate this substrate.
- Fixture examples need real private payloads or secrets.
- A command-porting concern starts entering this technical story.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
