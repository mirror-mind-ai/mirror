# Validation — CV22.DS5.US4

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test; cd .. && git diff --check

Checks status: passed

## E2E

Decision: waived

Evidence: Replay/copy-safe front-door dogfood covered consult credits, consult ask, and memories --search through TS routes without live provider credentials. Search route used a copy DB with replayed embedding and verified metadata-only front-door logs; live provider smoke is optional and was not required.

## Navigator Validation

Route: Inspect ts/src/frontDoor/routing.ts, ts/src/frontDoor/cli.ts, ts/src/frontDoor/consultRoute.ts, ts/src/frontDoor/searchRoute.ts, and ts/test/frontDoor/externalRoutes.test.ts; run cd ts && npm run typecheck && npm run lint && npm test; cd .. && git diff --check; inspect rg prompt/context/secret hits as intentional implementation/test/schema strings only.

Navigator accepted: yes

Expected observation: With MIRROR_TS_EXTERNAL_ROUTES=1 and replay fixtures, the TS front door routes consult credits, consult ask, and memories --search through TS; without safe config or for unvalidated commands, Python fallback remains.

Pass condition: Automated checks pass; replay/copy-safe dogfood proves routed DS5 commands execute via TS; CI requires no network/credentials; logs remain metadata-only; unvalidated external commands still fallback; search writes are backup-gated/copy-safe.

Fail condition: Any unvalidated external command routes to TS, CI needs live credentials/network, prompt/query/context/provider payloads or secrets appear in logs/fixtures/commits, search mutates live DB without backup gating, or Python fallback is removed outside scope.

## Missing Evidence

- none
