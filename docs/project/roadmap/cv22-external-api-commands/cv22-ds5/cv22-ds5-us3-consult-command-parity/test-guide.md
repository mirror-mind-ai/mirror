# Test Guide — CV22.DS5.US3 Consult Command Parity

## Purpose

Validate that TypeScript can execute the consult command core against scrubbed replay fixtures with Python-compatible parsing, model resolution, message construction, and output rendering, without live provider calls.

## Required Automated Checks

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

Adjust focused globs if implementation uses different final test paths.

## Expected Coverage

- Model family/tier resolution matches Python, including direct model ids and error wording.
- Consult argv parsing handles `credits`, ask prompts, tiers, and flags.
- Ask execution builds `SYSTEM_PREAMBLE + context` and user prompt messages.
- Rendered output matches Python shape for response fences, token lines, generation cost, and credits balance.
- Cost and credits replay seams require no network.
- Unsafe provider fixtures are rejected.
- `consult` is not routed through the TS front door before `CV22.DS5.US4`.

## Navigator Validation

Pass if:

- All required checks pass.
- Committed fixtures are synthetic/scrubbed and do not contain raw private Mirror context or real provider payloads.
- No live provider credentials are needed in CI.
- Front-door routing remains unchanged.

Fail if:

- Python-compatible consult output or parse semantics diverge without a recorded decision.
- CI needs live provider credentials/network.
- Real secrets/private payloads are committed.
- `consult` is routed early.

## Validation Evidence

Implementation checks run locally:

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

Result:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 210 tests.
- Focused consult/provider command: passed.
- `git diff --check`: passed.
- Secret/payload grep showed only fake test secrets, redaction/config patterns, schema `token_count`, and unrelated token wording; no real provider credential, raw private Mirror context, or live provider payload is committed.

Implemented evidence:

- `resolveConsultModel` mirrors Python family/tier/direct-model behavior and error wording.
- `parseConsultArgs` covers `credits`, ask prompts, tier handling, consult flags, and missing-argument errors.
- Consult core builds `SYSTEM_PREAMBLE + context` plus user prompt, using injected context/LLM/credits/cost seams.
- Renderers preserve Python response fences, token line omission rules, cost formatting, credits bar, and BRL conversion.
- `ReplayCreditProvider` supplies deterministic credits and generation-cost replay without network.
- `ts/src/frontDoor/routing.ts` was not changed; runtime consult cutover remains deferred to `CV22.DS5.US4`.
