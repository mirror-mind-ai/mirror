# Plan — CV22.DS5.US3 Consult Command Parity

## Objective

Port the consult command core to TypeScript behind replayable provider, credits, and cost seams, preserving the Python command contract and output rendering without front-door routing or live-provider dependency in CI.

## Python behavior to preserve

Reference files:

- `src/memory/cli/consult.py`
- `src/memory/intelligence/llm_router.py`
- `src/memory/services/identity.py` (`load_mirror_context`)
- `src/memory/config.py` (`LLM_FAMILIES`, OpenRouter config)

Current Python contract:

1. `consult credits` fetches OpenRouter credit info and renders:
   - `Balance: openrouter: {20-char bar} R$ {balance_brl:.2f}`
   - `fill = int(20 * balance / total_credits)` when `total_credits > 0`, else `0`.
   - `USD_TO_BRL = 5.7`.
2. `consult <family> [tier] <question> [--persona P] [--journey J] [--org] [--query Q] [--mirror-home PATH]` resolves model id:
   - direct model ids containing `/` pass through unchanged;
   - known family/tier maps through `LLM_FAMILIES`;
   - default tier is `lite`;
   - unknown family/tier errors match Python wording.
3. Argument parsing errors print usage/error and exit non-zero in Python. TS core should expose the same parse result/error contract for the front door to use later.
4. Ask flow builds Mirror context using `load_mirror_context(persona, journey, org, query)` and sends messages:
   - system: `SYSTEM_PREAMBLE + context`;
   - user: prompt.
5. Ask rendering:
   - `Consulting {model_id}...`
   - `--- response via {resp.model} ---`
   - raw response content
   - `--- end ---`
   - optional token line: `[prompt: N, completion: M]`, omitting missing parts.
   - optional cost line when generation cost is available:
     - `< $0.01`: `Call cost: ${cost:.6f} (R$ {brl:.4f})`
     - otherwise: `Call cost: ${cost:.4f} (R$ {brl:.2f})`
   - final credits balance rendering.
6. Provider failures should surface with redacted diagnostics; secrets must never appear in errors/logs/fixtures.

## Implementation Scope

Add a TS consult core and render seam; do **not** route the runtime CLI yet.

Likely files:

```text
ts/src/consult/modelCatalog.ts      # Python-compatible family/tier resolution
ts/src/consult/args.ts              # parse consult argv into ask/credits or typed parse errors
ts/src/consult/render.ts            # Python-compatible response/credits/cost rendering
ts/src/consult/core.ts              # build messages, call provider/cost/credits seams, return rendered output
ts/src/providers/credits.ts         # credit/cost provider interfaces + replay fixtures if useful
ts/test/consult/*.test.ts           # parser/model/render/core tests
```

Existing DS5 provider modules should be reused:

- `ts/src/providers/config.ts` for env/config-only provider config.
- `ts/src/providers/llm.ts` for `LlmProvider` and replayed model responses.
- `ts/src/providers/replay.ts` / `redaction.ts` for fixture loading and safety.

The final file layout may differ if a cleaner seam appears, but keep these boundaries:

- model/arg parsing is pure and testable;
- rendering is pure and Python-compatible;
- provider/cost/credits are injected and replayed in tests;
- context loading is injected (or read via an existing TS identity seam if narrow enough), so consult core can be validated without live DB/private context.

## Provider / Fixture Contract

Use replay-only fixtures in CI for:

- LLM response content and metadata (`model`, token counts, optional `generationId`);
- generation cost lookup by generation id;
- credits balance (`total_credits`, `total_usage`, `balance`).

Fixtures must be synthetic and scrubbed. They must not contain:

- real API keys or authorization headers;
- raw private prompts/context;
- live provider payloads;
- production DB artifacts.

Live OpenRouter transport may remain a future/manual seam. If implemented here, it must be optional, use env/config-only secrets, and never be required by tests.

## Acceptance Behavior

```text
Given synthetic Mirror context and scrubbed replay provider fixtures
When TS consult core parses a Python-compatible consult argv and executes ask or credits
Then model resolution, provider messages, rendered response, token/cost/credits lines, and parse errors match the Python contract
And no live provider call, credential, raw private context, or front-door route cutover is required in CI
```

## Test Plan

Automated tests should cover:

1. Model resolution:
   - direct model id with `/` passes through;
   - known family default tier resolves to `lite`;
   - explicit `lite`/`mid`/`flagship` resolves;
   - unknown family error includes sorted available families;
   - unknown tier error matches Python wording.
2. Argument parsing:
   - `credits` command;
   - ask with family + question;
   - ask with explicit tier + multiword prompt;
   - `--persona`, `--journey`, `--org`, `--query`, `--mirror-home` flags;
   - missing family/question errors.
3. Message construction:
   - system message equals `SYSTEM_PREAMBLE + injected context`;
   - user message equals prompt;
   - provider called with resolved model id.
4. Rendering:
   - consulting header, response fence, response content, end fence;
   - token line with prompt-only, completion-only, both, and neither;
   - cost formatting for `< $0.01` and `>= $0.01`;
   - credits bar and BRL conversion, including `total_credits = 0`.
5. Replay/failure safety:
   - no network or live credentials required;
   - unsafe fixtures are rejected by existing redaction checks;
   - provider/config errors redact configured secrets.
6. Routing boundary:
   - `ts/src/frontDoor/routing.ts` remains unchanged; consult still falls back until `CV22.DS5.US4`.

## Validation Commands

Run from repo root unless noted:

```bash
cd ts
npm run typecheck
npm run lint
npm test
npm test -- test/consult/*.test.ts test/providers/*.test.ts
cd ..
git diff --check
rg 'Authorization: Bearer|OPENROUTER_API_KEY|api_key|apiKey|secret|token' ts/test ts/src
```

The focused test glob may be adjusted to the final implementation paths.

## E2E Decision

Runtime E2E through `python -m memory consult` / TS front-door routing is deferred to `CV22.DS5.US4`. Required validation here is core-level replay and output compatibility. Optional manual live-provider smoke may be run outside CI if credentials exist, but it is not required and must not produce committed raw provider payloads.

## Out of Scope

- Routing `consult` through the TS front door.
- Changing model-family selection policy.
- Adding new consult capabilities, streaming, MCP integration, or provider switching UX.
- Persisting consult logs/audit rows unless already available through a narrow seam and tested without scope expansion.
- Live provider calls in CI.
- Committing real provider payloads, private Mirror context, private prompts, production DB artifacts, or credentials.

## Navigator Validation Route

1. Inspect consult/model/render/provider files and confirm pure parse/render plus injected replay provider seams.
2. Confirm `ts/src/frontDoor/routing.ts` remains unchanged for `consult`.
3. Run validation commands.
4. Inspect secret/payload grep hits and confirm they are intentional fake test strings, schema names, or implementation patterns only.

## Pass Condition

- Automated checks pass.
- TS model resolution, argument parsing, message construction, credits rendering, cost formatting, and response rendering match Python contract.
- CI uses replay fixtures only and needs no live provider credentials/network.
- No real provider payload, raw private context/prompt, credential, or production DB artifact is committed.
- Front-door routing remains deferred to `CV22.DS5.US4`.

## Fail Condition

- User-visible consult output diverges from Python without an explicit decision.
- Live provider/network credentials are required in CI.
- Secrets or private context can appear in errors, logs, or fixtures.
- `consult` is routed through TS before `CV22.DS5.US4`.
