# Validation — CV22.DS5.US3

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test; cd .. && git diff --check

Checks status: passed

## E2E

Decision: waived

Evidence: Runtime E2E/front-door consult cutover is intentionally deferred to CV22.DS5.US4. Core-level replay validation covered model resolution, consult argv parsing, system/user message construction, replayed LLM responses, replayed credits/generation costs, Python-compatible rendering, and no live provider credentials.

## Navigator Validation

Route: Inspect ts/src/consult/*, ts/src/providers/credits.ts, ts/src/providers/llm.ts, and ts/test/consult/*; confirm ts/src/frontDoor/routing.ts is unchanged; run cd ts && npm run typecheck && npm run lint && npm test; cd .. && git diff --check; inspect rg secret hits as intentional fake test strings/schema names/patterns only.

Navigator accepted: yes

Expected observation: TS consult core parses Python-compatible consult argv, resolves model ids, builds Mirror-context messages, and renders replayed responses/costs/credits without live provider calls or front-door routing.

Pass condition: Automated checks pass; parse/model/render semantics match Python; CI uses replay seams only; no real provider credential, private context/prompt, or live provider payload is committed; front-door routing remains unchanged.

Fail condition: Consult output or parse behavior diverges, live credentials/network are required in CI, secrets/private context can appear in fixtures/errors, or consult is routed through TS before US4.

## Missing Evidence

- none
